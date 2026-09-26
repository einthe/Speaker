import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// PostgreSQL runs the actual production migration. These shims represent the
// Supabase-owned auth/storage schema; hosted Auth/Storage HTTP is tested separately.
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  coach = id(2),
  player = id(3),
  other = id(4),
  pending = id(5),
  rejected = id(6),
  disabled = id(7);
const sql = (query: string, params?: unknown[]) => db.query(query, params);
async function asUser<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? "authenticated" : "anon"};`);
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(name: string, data: unknown) {
  const result = await sql(`select public.${name}($1::jsonb) as result`, [JSON.stringify(data)]);
  return (result.rows[0] as { result: string }).result;
}
const postInput = { title: "Team update", body: "A private message", role_context: null };
const eventInput = (type = "match") => ({
  event_type: type,
  title: "Test event",
  description: "For the team",
  starts_at: "2026-11-10T18:00:00Z",
  ends_at: "2026-11-10T20:00:00Z",
  location: "Dragvoll",
  opponent: "Opponent",
  home_away: "home",
  team_sets: null,
  opponent_sets: null,
  assignments: [],
});
const userInput = (target: string, extra = {}) => ({
  id: target,
  full_name: "Test Member",
  base_role: "player",
  account_status: "approved",
  jersey_number: null,
  roles: [],
  ...extra,
});
let postId: string, matchId: string;
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (let i = 1; i <= 16; i++)
    await sql("insert into auth.users values($1,$2,$3)", [
      id(i),
      `member${i}@example.test`,
      JSON.stringify({ full_name: `Member ${i}`, base_role: "admin", account_status: "approved" }),
    ]);
  await sql("update public.profiles set base_role='admin',account_status='approved' where id=$1", [
    admin,
  ]);
  await sql("update public.profiles set base_role='coach',account_status='approved' where id=$1", [
    coach,
  ]);
  await sql(
    "update public.profiles set base_role='player',account_status='approved' where id=any($1::uuid[])",
    [[player, other, ...Array.from({ length: 9 }, (_, i) => id(i + 8))]],
  );
  await sql("update public.profiles set account_status='rejected' where id=$1", [rejected]);
  await sql("update public.profiles set account_status='disabled',base_role='player' where id=$1", [
    disabled,
  ]);
  for (let i = 0; i < 6; i++)
    await asUser(coach, () =>
      rpc("set_positions", {
        id: id(i + 8),
        primary: [
          "setter",
          "outside_hitter",
          "middle_blocker",
          "opposite",
          "outside_hitter",
          "middle_blocker",
        ][i],
        secondary: [],
      }),
    );
  postId = await asUser(player, () => rpc("save_post", postInput));
  matchId = await asUser(coach, () => rpc("save_event", eventInput()));
});
afterAll(async () => {
  await db.close();
});

describe("team image settings", () => {
  const settings = () => sql("select responsive_images,version from public.image_settings");
  it("defaults on and only approved members can read it", async () => {
    expect((await asUser(player, settings)).rows).toEqual([
      { responsive_images: true, version: 0 },
    ]);
    expect((await asUser(pending, settings)).rows).toEqual([]);
    await expect(asUser(null, settings)).rejects.toThrow();
  });
  it("restricts writes to approved admins and rejects stale/invalid writes", async () => {
    for (const user of [null, coach, player, pending, disabled])
      await expect(
        asUser(user, () =>
          rpc("set_image_settings", {
            responsive_images: false,
            expected_version: 0,
          }),
        ),
      ).rejects.toThrow();
    await expect(
      asUser(admin, () => sql("update public.image_settings set responsive_images=false")),
    ).rejects.toThrow();
    await expect(
      asUser(admin, () =>
        rpc("set_image_settings", {
          responsive_images: "false",
          expected_version: 0,
        }),
      ),
    ).rejects.toThrow("invalid_setting");
    await asUser(admin, () =>
      rpc("set_image_settings", { responsive_images: false, expected_version: 0 }),
    );
    expect((await asUser(player, settings)).rows).toEqual([
      { responsive_images: false, version: 1 },
    ]);
    await expect(
      asUser(admin, () =>
        rpc("set_image_settings", {
          responsive_images: true,
          expected_version: 0,
        }),
      ),
    ).rejects.toThrow("stale_record");
    await asUser(admin, () =>
      rpc("set_image_settings", { responsive_images: true, expected_version: 1 }),
    );
  });
  it("rejects writes from a disabled administrator", async () => {
    await sql("update public.profiles set account_status='disabled' where id=$1", [admin]);
    try {
      await expect(
        asUser(admin, () =>
          rpc("set_image_settings", {
            responsive_images: false,
            expected_version: 2,
          }),
        ),
      ).rejects.toThrow("not_authorized");
    } finally {
      await sql("update public.profiles set account_status='approved' where id=$1", [admin]);
    }
  });
});

describe("private profile pictures", () => {
  it("limits writes to the current user, preserves the current file, and rejects stale changes", async () => {
    const author = id(30),
      viewer = id(31);
    for (const user of [author, viewer]) {
      await sql("insert into auth.users values($1,$2,$3)", [
        user,
        `${user}@example.test`,
        JSON.stringify({ full_name: "Photo User" }),
      ]);
      await sql("update profiles set account_status='approved',base_role='player' where id=$1", [
        user,
      ]);
    }
    const first = `${author}/${id(50)}.webp`,
      next = `${author}/${id(51)}.webp`;
    await asUser(author, async () => {
      for (const path of [first, next])
        await sql(
          "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
          [path, author],
        );
      await rpc("set_profile_photo", { storage_path: first, expected_path: null, user_id: viewer });
      expect((await sql("select user_id from profile_photos")).rows).toEqual([{ user_id: author }]);
      expect(
        (
          await sql(
            "delete from storage.objects where bucket_id='profile-photos' and name=$1 returning id",
            [first],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        sql("update profile_photos set storage_path=$1 where user_id=$2", [next, author]),
      ).rejects.toThrow();
      await expect(
        rpc("set_profile_photo", { storage_path: next, expected_path: null }),
      ).rejects.toThrow("stale_profile_photo");
    });
    await asUser(viewer, async () => {
      expect(
        (await sql("select storage_path from profile_photos where user_id=$1", [author])).rows,
      ).toEqual([{ storage_path: first }]);
      expect(
        (
          await sql("select id from storage.objects where bucket_id='profile-photos' and name=$1", [
            first,
          ])
        ).rows,
      ).toHaveLength(1);
      await expect(
        rpc("set_profile_photo", { storage_path: first, expected_path: null }),
      ).rejects.toThrow("invalid_media");
      await expect(
        sql("insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)", [
          `${author}/${id(52)}.webp`,
          viewer,
        ]),
      ).rejects.toThrow();
      expect(
        (
          await sql(
            "delete from storage.objects where bucket_id='profile-photos' and name=$1 returning id",
            [next],
          )
        ).rows,
      ).toHaveLength(0);
    });
    await asUser(author, async () => {
      expect(await rpc("set_profile_photo", { storage_path: next, expected_path: first })).toBe(
        first,
      );
      expect(
        (
          await sql(
            "delete from storage.objects where bucket_id='profile-photos' and name=$1 returning id",
            [first],
          )
        ).rows,
      ).toHaveLength(1);
      expect(await rpc("set_profile_photo", { storage_path: null, expected_path: next })).toBe(
        next,
      );
      expect(
        (
          await sql(
            "delete from storage.objects where bucket_id='profile-photos' and name=$1 returning id",
            [next],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });
  it("denies anonymous and unapproved accounts, but permits coach and administrator pictures", async () => {
    await asUser(null, () => expect(rpc("set_profile_photo", {})).rejects.toThrow());
    for (const [index, role, status] of [
      [60, "coach", "approved"],
      [61, "admin", "approved"],
      [62, "player", "pending"],
      [63, "player", "disabled"],
    ] as const) {
      const user = id(index),
        path = `${user}/${id(index + 10)}.webp`;
      await sql("insert into auth.users values($1,$2,$3)", [
        user,
        `${user}@example.test`,
        JSON.stringify({ full_name: "Photo Access" }),
      ]);
      await sql("update profiles set base_role=$2,account_status=$3 where id=$1", [
        user,
        role,
        status,
      ]);
      await asUser(user, async () => {
        if (status !== "approved") {
          await expect(rpc("set_profile_photo", {})).rejects.toThrow("not_authorized");
          expect((await sql("select * from profile_photos")).rows).toHaveLength(0);
          await expect(
            sql(
              "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
              [path, user],
            ),
          ).rejects.toThrow();
        } else {
          await sql(
            "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
            [path, user],
          );
          await rpc("set_profile_photo", { storage_path: path });
          await rpc("set_profile_photo", { storage_path: null, expected_path: path });
          await sql("delete from storage.objects where bucket_id='profile-photos' and name=$1", [
            path,
          ]);
        }
      });
    }
  });
});
describe.sequential("real PostgreSQL privileges and RLS", () => {
  it("ignores forged registration role metadata and creates a pending profile", async () => {
    const result = await sql("select base_role,account_status from profiles where id=$1", [
      pending,
    ]);
    expect(result.rows[0]).toEqual({ base_role: null, account_status: "pending" });
  });
  it("rejects approved profiles without one base role", async () => {
    await expect(
      sql("update profiles set account_status='approved' where id=$1", [pending]),
    ).rejects.toThrow();
  });
  it("denies anonymous reads and RPC execution", async () => {
    await asUser(null, async () => {
      await expect(sql("select * from posts")).rejects.toThrow();
      await expect(rpc("save_post", postInput)).rejects.toThrow();
    });
  });
  for (const [label, user] of [
    ["pending", pending],
    ["rejected", rejected],
    ["disabled", disabled],
  ])
    it(`blocks ${label} accounts from private tables and mutations`, async () => {
      await asUser(user, async () => {
        for (const table of [
          "posts",
          "schedule_events",
          "player_profiles",
          "lineup_revisions",
          "notifications",
        ])
          expect((await sql(`select * from ${table}`)).rows).toHaveLength(0);
        await expect(rpc("save_post", postInput)).rejects.toThrow("not_authorized");
      });
    });
  it("allows a pending user to read only their own profile", async () => {
    await asUser(pending, async () => {
      expect((await sql("select id from profiles")).rows).toEqual([{ id: pending }]);
    });
  });
  it("hides admins and inactive profiles from ordinary roster reads", async () => {
    await asUser(player, async () => {
      const rows = (await sql("select id from profiles")).rows as { id: string }[];
      expect(rows.map((r) => r.id)).not.toContain(admin);
      expect(rows.map((r) => r.id)).not.toContain(pending);
    });
  });
  it("has no roster email column and restricts the email RPC", async () => {
    await asUser(player, async () => {
      await expect(sql("select email from profiles")).rejects.toThrow();
      await expect(sql("select * from admin_users()")).rejects.toThrow("not_authorized");
    });
    const result = await asUser(admin, () => sql("select * from admin_users()"));
    expect((result.rows[0] as { email: string }).email).toContain("@example.test");
  });
  it("prevents direct profile, role, post and notification rule writes", async () => {
    await asUser(player, async () => {
      await expect(
        sql("update profiles set base_role='admin' where id=$1", [player]),
      ).rejects.toThrow();
      await expect(
        sql("insert into player_secondary_roles values($1,'captain',$1,now())", [player]),
      ).rejects.toThrow();
      await expect(sql("update posts set author_user_id=$1", [player])).rejects.toThrow();
      await expect(sql("update notification_rules set enabled=true")).rejects.toThrow();
    });
  });
  it("prevents API admin promotion even by admin and protects the admin account", async () => {
    await asUser(admin, async () => {
      await expect(rpc("manage_user", userInput(player, { base_role: "admin" }))).rejects.toThrow(
        "invalid_role_or_status",
      );
      await expect(rpc("manage_user", userInput(admin))).rejects.toThrow("invalid_role_or_status");
    });
  });
  it("approves, disables, and re-enables a user through the admin RPC", async () => {
    await asUser(admin, () => rpc("manage_user", userInput(pending)));
    await asUser(pending, async () => {
      expect((await sql("select * from posts")).rows.length).toBeGreaterThan(0);
    });
    await asUser(admin, () =>
      rpc("manage_user", userInput(pending, { account_status: "disabled" })),
    );
    await asUser(pending, async () => {
      expect((await sql("select * from posts")).rows).toHaveLength(0);
    });
    await asUser(admin, () => rpc("manage_user", userInput(pending)));
  });
  it("rejects normal user and coach role/jersey administration", async () => {
    for (const user of [player, coach])
      await asUser(user, () =>
        expect(rpc("manage_user", userInput(other, { jersey_number: 9 }))).rejects.toThrow(
          "not_authorized",
        ),
      );
  });
  it("allows several secondary roles but no duplicate jersey", async () => {
    await asUser(admin, () =>
      rpc(
        "manage_user",
        userInput(player, { jersey_number: 9, roles: ["captain", "team_manager"] }),
      ),
    );
    await asUser(admin, () =>
      expect(rpc("manage_user", userInput(other, { jersey_number: 9 }))).rejects.toThrow(),
    );
    const result = await sql("select * from player_secondary_roles where player_user_id=$1", [
      player,
    ]);
    expect(result.rows).toHaveLength(2);
  });
  it("freezes role context and removes player data transactionally on coach promotion", async () => {
    const id = await asUser(player, () =>
      rpc("save_post", { ...postInput, role_context: "team_manager" }),
    );
    await asUser(admin, () =>
      rpc("manage_user", userInput(player, { base_role: "coach", roles: ["captain"] })),
    );
    expect(
      (await sql("select * from player_secondary_roles where player_user_id=$1", [player])).rows,
    ).toHaveLength(0);
    expect(
      (await sql("select secondary_role_context_label_snapshot from posts where id=$1", [id]))
        .rows[0],
    ).toEqual({ secondary_role_context_label_snapshot: "Oppmann" });
    await asUser(player, () =>
      expect(rpc("save_post", { ...postInput, role_context: "team_manager" })).rejects.toThrow(
        "invalid_role_context",
      ),
    );
    await asUser(admin, () => rpc("manage_user", userInput(player)));
  });
  it("allows coach position assignments and rejects player self-assignment", async () => {
    await asUser(player, () =>
      expect(
        rpc("set_positions", { id: player, primary: "setter", secondary: [] }),
      ).rejects.toThrow("not_authorized"),
    );
    await asUser(coach, () =>
      rpc("set_positions", {
        id: player,
        primary: "setter",
        secondary: ["outside_hitter", "opposite"],
      }),
    );
    expect(
      (await sql("select * from player_positions where player_user_id=$1", [player])).rows,
    ).toHaveLength(3);
    await asUser(coach, () =>
      expect(
        rpc("set_positions", { id: player, primary: "setter", secondary: ["setter"] }),
      ).rejects.toThrow(),
    );
  });
  it("rejects forged post authors, snapshots and unheld role contexts", async () => {
    const p = await asUser(player, () =>
      rpc("save_post", { ...postInput, author_user_id: admin, base_role_snapshot: "admin" }),
    );
    expect(
      (await sql("select author_user_id,base_role_snapshot from posts where id=$1", [p])).rows[0],
    ).toEqual({ author_user_id: player, base_role_snapshot: "player" });
    await asUser(player, () =>
      expect(rpc("save_post", { ...postInput, role_context: "captain" })).rejects.toThrow(
        "invalid_role_context",
      ),
    );
  });
  it("rejects other-author edits/deletes including coaches but permits admin moderation", async () => {
    const row = (await sql("select updated_at::text from posts where id=$1", [postId])).rows[0] as {
      updated_at: string;
    };
    for (const actor of [other, coach])
      await asUser(actor, async () => {
        await expect(
          rpc("save_post", { ...postInput, id: postId, expected_updated_at: row.updated_at }),
        ).rejects.toThrow("not_authorized");
        await expect(sql("select delete_post($1)", [postId])).rejects.toThrow("not_authorized");
      });
    await asUser(admin, () =>
      rpc("save_post", {
        ...postInput,
        id: postId,
        title: "Moderated",
        expected_updated_at: row.updated_at,
      }),
    );
  });
  it("rejects stale post updates", async () => {
    await asUser(player, () =>
      expect(
        rpc("save_post", { ...postInput, id: postId, expected_updated_at: "2000-01-01T00:00:00Z" }),
      ).rejects.toThrow("stale_record"),
    );
  });
  it("enforces the coach and ordinary player event matrix", async () => {
    await asUser(player, () =>
      expect(rpc("save_event", eventInput())).rejects.toThrow("not_authorized"),
    );
    await asUser(coach, () =>
      expect(rpc("save_event", eventInput("social"))).rejects.toThrow("not_authorized"),
    );
    await asUser(coach, () => rpc("save_event", eventInput("practice")));
  });
  it("enforces matching secondary-role category and original creator on edit", async () => {
    await asUser(admin, () =>
      rpc("manage_user", userInput(player, { roles: ["social_coordinator"] })),
    );
    await asUser(admin, () =>
      rpc("manage_user", userInput(other, { roles: ["social_coordinator"] })),
    );
    const event = await asUser(player, () => rpc("save_event", eventInput("social")));
    const row = (await sql("select updated_at::text from schedule_events where id=$1", [event]))
      .rows[0] as { updated_at: string };
    await asUser(other, () =>
      expect(
        rpc("save_event", {
          ...eventInput("social"),
          id: event,
          expected_updated_at: row.updated_at,
        }),
      ).rejects.toThrow("not_authorized"),
    );
    await asUser(player, () =>
      expect(rpc("save_event", eventInput("travel"))).rejects.toThrow("not_authorized"),
    );
  });
  it("rejects invalid date intervals and modification of event category", async () => {
    await asUser(coach, () =>
      expect(
        rpc("save_event", { ...eventInput(), ends_at: "2020-01-01T00:00:00Z" }),
      ).rejects.toThrow(),
    );
    await asUser(admin, () =>
      expect(rpc("save_event", { ...eventInput("social"), id: matchId })).rejects.toThrow(
        "event_type_immutable",
      ),
    );
  });
  it("only enables notification rules through admin and creates no notifications by default", async () => {
    expect((await sql("select * from notifications")).rows).toHaveLength(0);
    expect((await sql("select * from notification_rules where enabled")).rows).toHaveLength(0);
    await asUser(player, () =>
      expect(
        rpc("set_notification_rule", { trigger_key: "normal_post_created", enabled: true }),
      ).rejects.toThrow("not_authorized"),
    );
  });
  it("emits enabled notifications only to approved recipients except the actor", async () => {
    await asUser(admin, () =>
      rpc("set_notification_rule", { trigger_key: "normal_post_created", enabled: true }),
    );
    const p = await asUser(player, () => rpc("save_post", postInput));
    const rows = (await sql("select user_id from notifications where target_id=$1", [p])).rows as {
      user_id: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.user_id)).not.toContain(player);
    expect(rows.map((r) => r.user_id)).not.toContain(disabled);
  });
  it("isolates notification rows and read-state writes", async () => {
    const rows = (await asUser(other, () => sql("select id,user_id from notifications"))).rows as {
      id: string;
      user_id: string;
    }[];
    expect(rows.every((r) => r.user_id === other)).toBe(true);
    await asUser(player, () =>
      expect(sql("select mark_notification_read($1)", [rows[0].id])).rejects.toThrow(
        "not_authorized",
      ),
    );
    await asUser(other, () => sql("select mark_notification_read($1)", [rows[0].id]));
    expect(
      (await sql("select read_at from notifications where id=$1", [rows[0].id])).rows[0],
    ).not.toEqual({ read_at: null });
  });
  it("creates volunteer assignments only for approved players and notifies only new assignees", async () => {
    await asUser(admin, () =>
      rpc("manage_user", userInput(player, { roles: ["volunteer_work_coordinator"] })),
    );
    await asUser(admin, () =>
      rpc("set_notification_rule", { trigger_key: "volunteer_assignment_created", enabled: true }),
    );
    const event = await asUser(player, () =>
      rpc("save_event", { ...eventInput("volunteer_work"), assignments: [other] }),
    );
    expect(
      (await sql("select player_user_id from volunteer_assignments where event_id=$1", [event]))
        .rows,
    ).toEqual([{ player_user_id: other }]);
    expect(
      (await sql("select user_id from notifications where target_id=$1", [event])).rows,
    ).toEqual([{ user_id: other }]);
    await asUser(player, () =>
      expect(
        rpc("save_event", { ...eventInput("volunteer_work"), assignments: [coach] }),
      ).rejects.toThrow("invalid_player"),
    );
  });
  it("saves incomplete drafts and hides them from players", async () => {
    await asUser(coach, () =>
      rpc("save_lineup", {
        match_id: matchId,
        setter_position: 1,
        expected_revision: 0,
        publish: false,
        slots: [
          { player_user_id: id(8), lineup_role: "setter", court_position: 1, is_libero: false },
        ],
      }),
    );
    await asUser(player, async () => {
      expect((await sql("select * from lineup_revisions")).rows).toHaveLength(0);
      expect((await sql("select * from lineup_revision_slots")).rows).toHaveLength(0);
    });
  });
  it("rejects player publication, incomplete starters and duplicate libero", async () => {
    const data = {
      match_id: matchId,
      setter_position: 1,
      expected_revision: 1,
      publish: true,
      slots: [],
    };
    await asUser(player, () => expect(rpc("save_lineup", data)).rejects.toThrow("not_authorized"));
    await asUser(coach, () =>
      expect(rpc("save_lineup", data)).rejects.toThrow("six_starters_required"),
    );
    const slots = Array.from({ length: 6 }, (_, i) => ({
      player_user_id: id(i + 8),
      lineup_role: ["setter", "k1", "m1", "opposite", "k2", "m2"][i],
      court_position: i + 1,
      is_libero: false,
    }));
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", {
          ...data,
          slots: [...slots, { player_user_id: id(8), court_position: null, is_libero: true }],
        }),
      ).rejects.toThrow(),
    );
  });
  it("publishes structured snapshots and preserves old versions after profile changes", async () => {
    const slots = Array.from({ length: 6 }, (_, i) => ({
      player_user_id: id(i + 8),
      lineup_role: ["setter", "k1", "m1", "opposite", "k2", "m2"][i],
      court_position: i + 1,
      is_libero: false,
    }));
    const revision = await asUser(coach, () =>
      rpc("save_lineup", {
        match_id: matchId,
        setter_position: 1,
        expected_revision: 1,
        publish: true,
        slots,
      }),
    );
    const original = (
      await sql(
        "select full_name_snapshot,jersey_number_snapshot from lineup_revision_slots where lineup_revision_id=$1 and player_user_id=$2",
        [revision, id(8)],
      )
    ).rows[0];
    await asUser(admin, () =>
      rpc("manage_user", userInput(id(8), { full_name: "Changed Name", jersey_number: 18 })),
    );
    expect(
      (
        await sql(
          "select full_name_snapshot,jersey_number_snapshot from lineup_revision_slots where lineup_revision_id=$1 and player_user_id=$2",
          [revision, id(8)],
        )
      ).rows[0],
    ).toEqual(original);
    await asUser(coach, () =>
      rpc("save_lineup", {
        match_id: matchId,
        setter_position: 1,
        expected_revision: 2,
        publish: true,
        slots,
      }),
    );
    expect(
      (await sql("select * from lineup_revisions where status='published'")).rows,
    ).toHaveLength(2);
    expect((await sql("select * from posts where post_type='lineup'")).rows).toHaveLength(1);
    await asUser(player, async () => {
      expect((await sql("select * from lineup_revisions")).rows).toHaveLength(2);
      expect((await sql("select * from lineup_revision_slots")).rows).toHaveLength(12);
      expect((await sql("select * from lineups")).rows).toHaveLength(1);
    });
  });
  it("rejects stale lineup updates and preserves matches with history", async () => {
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", {
          match_id: matchId,
          setter_position: 1,
          expected_revision: 1,
          publish: false,
          slots: [],
        }),
      ).rejects.toThrow("stale_revision"),
    );
    await asUser(coach, () =>
      expect(sql("select delete_event($1)", [matchId])).rejects.toThrow("lineup_history_exists"),
    );
  });
  it("keeps the image bucket private and restricts object access", async () => {
    expect(
      (await sql("select public from storage.buckets where id='post-images'")).rows[0],
    ).toEqual({ public: false });
    const path = `${player}/${id(99)}.webp`;
    await asUser(player, () =>
      sql("insert into storage.objects(bucket_id,name,owner_id) values('post-images',$1,$2)", [
        path,
        player,
      ]),
    );
    await asUser(disabled, async () => {
      expect((await sql("select * from storage.objects")).rows).toHaveLength(0);
    });
    await asUser(other, async () => {
      expect((await sql("select * from storage.objects")).rows).toHaveLength(0);
      await expect(
        rpc("attach_media", {
          post_id: postId,
          storage_path: path,
          mime_type: "image/webp",
          size_bytes: 100,
        }),
      ).rejects.toThrow("not_authorized");
    });
    await asUser(player, () =>
      rpc("attach_media", {
        post_id: postId,
        storage_path: path,
        mime_type: "image/webp",
        size_bytes: 100,
      }),
    );
    await asUser(other, async () => {
      expect((await sql("select * from storage.objects")).rows).toHaveLength(1);
    });
  });
  it("keeps galleries ordered, private, capped and idempotent on upload retries", async () => {
    const galleryPost = await asUser(player, () => rpc("save_post", postInput));
    const input = (n: number) => ({
      post_id: galleryPost,
      storage_path: `${player}/gallery-${n}.webp`,
      mime_type: "image/webp",
      size_bytes: 100,
    });
    for (let n = 0; n < 11; n++) {
      await sql(
        "insert into storage.objects(bucket_id,name,owner_id) values('post-images',$1,$2)",
        [input(n).storage_path, player],
      );
    }
    await asUser(other, () =>
      expect(rpc("attach_media", input(0))).rejects.toThrow("not_authorized"),
    );
    for (const dimensions of [{ width: 0, height: 800 }, { width: 1200 }]) {
      await asUser(player, () =>
        expect(rpc("attach_media", { ...input(0), ...dimensions })).rejects.toThrow(
          "post_media_dimensions",
        ),
      );
    }
    const first = await asUser(player, () =>
      rpc("attach_media", { ...input(0), width: 1200, height: 800 }),
    );
    expect(
      (await sql("select width,height from public.post_media where id=$1", [first])).rows,
    ).toEqual([{ width: 1200, height: 800 }]);
    expect(await asUser(player, () => rpc("attach_media", input(0)))).toBe(first);
    for (let n = 1; n < 10; n++) await asUser(player, () => rpc("attach_media", input(n)));
    await asUser(player, () =>
      expect(rpc("attach_media", input(10))).rejects.toThrow("too_many_post_images"),
    );
    const rows = (
      await sql("select storage_path from public.post_media where post_id=$1 order by sort_order", [
        galleryPost,
      ])
    ).rows;
    expect(rows.map((row) => (row as { storage_path: string }).storage_path)).toEqual(
      Array.from({ length: 10 }, (_, n) => input(n).storage_path),
    );
    await asUser(disabled, async () =>
      expect(
        (await sql("select * from public.post_media where post_id=$1", [galleryPost])).rows,
      ).toHaveLength(0),
    );
    await asUser(player, () => sql("select public.remove_media($1)", [first]));
    await asUser(player, () => rpc("attach_media", input(10)));
    expect(
      (await sql("select * from public.post_media where post_id=$1", [galleryPost])).rows,
    ).toHaveLength(10);
  });
  it("does not expose internal notification/auth trigger functions as RPCs", async () => {
    await asUser(player, () =>
      expect(
        sql("select emit_notification('normal_post_created','forged','','post',$1,null)", [postId]),
      ).rejects.toThrow(),
    );
  });
  it("validates roles, rotation and primary/secondary eligibility in SQL", async () => {
    const match = await asUser(coach, () => rpc("save_event", eventInput()));
    const input = { match_id: match, setter_position: 6, expected_revision: 0, publish: false };
    const slot = { player_user_id: id(9), lineup_role: "k1", court_position: 1, is_libero: false };
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", { ...input, slots: [{ ...slot, player_user_id: id(8) }] }),
      ).rejects.toThrow("invalid_player_position"),
    );
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", { ...input, slots: [{ ...slot, court_position: 2 }] }),
      ).rejects.toThrow("invalid_lineup_rotation"),
    );
    await asUser(coach, () =>
      expect(rpc("save_lineup", { ...input, setter_position: 0, slots: [] })).rejects.toThrow(
        "invalid_setter_position",
      ),
    );
    await asUser(coach, () =>
      rpc("set_positions", { id: id(9), primary: "outside_hitter", secondary: ["libero"] }),
    );
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", {
          ...input,
          slots: [slot, { ...slot, lineup_role: "libero", court_position: null, is_libero: true }],
        }),
      ).rejects.toThrow(),
    );
    const revision = await asUser(coach, () =>
      rpc("save_lineup", {
        ...input,
        slots: [{ ...slot, lineup_role: "libero", court_position: null, is_libero: true }],
      }),
    );
    expect(
      (await sql("select setter_position from lineup_revisions where id=$1", [revision])).rows[0],
    ).toEqual({ setter_position: 6 });
    expect(
      (
        await sql(
          "select lineup_role,primary_position_snapshot from lineup_revision_slots where lineup_revision_id=$1",
          [revision],
        )
      ).rows[0],
    ).toEqual({ lineup_role: "libero", primary_position_snapshot: "outside_hitter" });
    await asUser(coach, () =>
      rpc("set_positions", { id: id(9), primary: "outside_hitter", secondary: [] }),
    );
    await asUser(coach, () =>
      expect(
        rpc("save_lineup", {
          ...input,
          expected_revision: 1,
          slots: [{ ...slot, lineup_role: "libero", court_position: null, is_libero: true }],
        }),
      ).rejects.toThrow("invalid_player_position"),
    );
  });
  it("captures event author role and preserves it when another coach/admin edits", async () => {
    const match = await asUser(coach, () => rpc("save_event", eventInput()));
    const event = (await sql("select * from schedule_events where id=$1", [match])).rows[0] as {
      updated_at: string;
    };
    await asUser(admin, () =>
      rpc("save_event", {
        ...eventInput(),
        id: match,
        title: "Admin edit",
        expected_updated_at: event.updated_at,
        creator_base_role_snapshot: "admin",
      }),
    );
    expect(
      (await sql("select creator_base_role_snapshot from schedule_events where id=$1", [match]))
        .rows[0],
    ).toEqual({ creator_base_role_snapshot: "coach" });
    await asUser(player, () => expect(sql("select snapshot_event_author()")).rejects.toThrow());
  });
});
