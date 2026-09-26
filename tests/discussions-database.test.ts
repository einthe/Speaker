import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const ids = {
  admin: randomUUID(),
  player: randomUUID(),
  coach: randomUUID(),
  pending: randomUUID(),
  disabled: randomUUID(),
};
const post = randomUUID(),
  otherPost = randomUUID(),
  event = randomUUID();
const target = { target_type: "post", target_id: post };
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      `${name}@example.test`,
      JSON.stringify({ full_name: name }),
    ]);
    await db.query("update profiles set base_role=$2,account_status=$3 where id=$1", [
      id,
      ["admin", "coach"].includes(name) ? name : "player",
      ["pending", "disabled"].includes(name) ? name : "approved",
    ]);
  }
  for (const id of [post, otherPost])
    await db.query(
      "insert into posts(id,author_user_id,author_name_snapshot,base_role_snapshot,post_type,title,body) values($1,$2,'player','player','normal','Test','Test')",
      [id, ids.player],
    );
  await db.query(
    "insert into schedule_events(id,event_type,title,starts_at,created_by_user_id) values($1,'practice','Training',now(),$2)",
    [event, ids.coach],
  );
});
afterAll(() => db.close());
async function as<T>(actor: keyof typeof ids, fn: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[actor]]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(name: string, data: unknown) {
  return (
    await db.query<{ result: unknown }>(`select public.${name}($1::jsonb) as result`, [
      JSON.stringify(data),
    ])
  ).rows[0].result;
}
const create = (extra: Record<string, unknown> = {}) => ({
  ...target,
  id: randomUUID(),
  parent_id: null,
  body: "Hello https://example.com",
  expected_version: null,
  ...extra,
});
const read = () =>
  rpc("get_discussion", target) as Promise<{
    comments: {
      id: string;
      body: string;
      deleted_at: string | null;
      author_name_snapshot: string;
      parent_id: string | null;
      giphy_id: string | null;
      author_user_id: string;
    }[];
    reactions: unknown[];
  }>;

it("lets all approved roles comment on posts and events and snapshots actual authors", async () => {
  for (const actor of ["player", "coach", "admin"] as const) {
    const comment = create({ author_name_snapshot: "forged" });
    await as(actor, () => rpc("save_comment", comment));
    await as(actor, () => rpc("save_comment", create({ target_type: "event", target_id: event })));
    const data = await as(actor, read);
    expect(data.comments.find((c) => c.id === comment.id)?.author_name_snapshot).toBe(actor);
  }
});
it("rejects unapproved access, anonymous RPCs and direct table writes", async () => {
  for (const actor of ["pending", "disabled"] as const) {
    await expect(as(actor, read)).rejects.toThrow("not_authorized");
    await expect(as(actor, () => rpc("save_comment", create()))).rejects.toThrow("not_authorized");
    await expect(
      as(actor, () => rpc("set_meme_reaction", { ...target, giphy_id: "abc", active: true })),
    ).rejects.toThrow("not_authorized");
    expect(
      (await as(actor, () => db.query("select * from discussion_comments"))).rows,
    ).toHaveLength(0);
  }
  await expect(
    as("admin", () => db.query("update discussion_comments set body='bad'")),
  ).rejects.toThrow("permission denied");
  await expect(as("player", () => db.query("delete from meme_reactions"))).rejects.toThrow(
    "permission denied",
  );
  await db.exec("set role anon");
  try {
    await expect(read()).rejects.toThrow("permission denied");
  } finally {
    await db.exec("reset role");
  }
});
it("keeps retries idempotent and rejects another user's reused ID", async () => {
  const comment = create();
  await as("player", () => rpc("save_comment", comment));
  await as("player", () => rpc("save_comment", comment));
  expect((await as("player", read)).comments.filter((c) => c.id === comment.id)).toHaveLength(1);
  await expect(as("coach", () => rpc("save_comment", comment))).rejects.toThrow("stale_comment");
});
it("supports nested replies, refuses cross-target parents and preserves replies after deletion", async () => {
  const root = create();
  const reply = create({ parent_id: root.id });
  await as("player", () => rpc("save_comment", root));
  await as("coach", () => rpc("save_comment", reply));
  await as("admin", () => rpc("save_comment", create({ parent_id: reply.id })));
  await expect(
    as("coach", () => rpc("save_comment", create({ parent_id: root.id, target_id: otherPost }))),
  ).rejects.toThrow("invalid_parent");
  await expect(
    as("coach", () =>
      rpc("save_comment", create({ parent_id: root.id, target_type: "event", target_id: event })),
    ),
  ).rejects.toThrow("invalid_parent");
  await as("player", () => rpc("delete_comment", { ...root, expected_version: 0 }));
  const data = await as("player", read);
  expect(data.comments.find((c) => c.id === root.id)).toMatchObject({
    body: "",
    deleted_at: expect.any(String),
  });
  expect(data.comments.some((c) => c.id === reply.id)).toBe(true);
  await expect(
    as("coach", () => rpc("save_comment", create({ parent_id: root.id }))),
  ).rejects.toThrow("stale_comment");
});
it("only authors may edit, admins may moderate and stale changes never overwrite", async () => {
  const comment = create();
  await as("player", () => rpc("save_comment", comment));
  for (const actor of ["coach", "admin"] as const)
    await expect(
      as(actor, () => rpc("save_comment", { ...comment, body: "Edited", expected_version: 0 })),
    ).rejects.toThrow("not_authorized");
  await expect(
    as("coach", () => rpc("delete_comment", { ...comment, expected_version: 0 })),
  ).rejects.toThrow("not_authorized");
  await as("player", () =>
    rpc("save_comment", { ...comment, body: "Edited", expected_version: 0 }),
  );
  await expect(
    as("player", () => rpc("save_comment", { ...comment, expected_version: 0 })),
  ).rejects.toThrow("stale_comment");
  await expect(
    as("admin", () => rpc("delete_comment", { ...comment, expected_version: 0 })),
  ).rejects.toThrow("stale_comment");
  await as("admin", () => rpc("delete_comment", { ...comment, expected_version: 1 }));
});
it("rejects empty/oversized bodies, nonexistent targets, invalid types and excessive depth", async () => {
  for (const body of ["", "   ", "x".repeat(3001)])
    await expect(as("player", () => rpc("save_comment", create({ body })))).rejects.toThrow(
      "invalid_comment",
    );
  for (const extra of [{ target_id: randomUUID() }, { target_type: "comment" }])
    await expect(as("player", () => rpc("save_comment", create(extra)))).rejects.toThrow(
      "invalid_target",
    );
  let parent: string | null = null;
  for (let depth = 0; depth <= 64; depth++) {
    const comment = create({ parent_id: parent });
    await as("player", () => rpc("save_comment", comment));
    parent = comment.id;
  }
  await expect(
    as("player", () => rpc("save_comment", create({ parent_id: parent }))),
  ).rejects.toThrow("thread_too_deep");
});
it("stores only Giphy IDs, deduplicates reactions and only removes the caller's reaction", async () => {
  const reaction = { ...target, giphy_id: "TestGIF123", active: true };
  for (const actor of ["player", "coach", "admin"] as const)
    await as(actor, () => rpc("set_meme_reaction", reaction));
  await as("player", () => rpc("set_meme_reaction", reaction));
  expect((await as("player", read)).reactions).toHaveLength(3);
  await as("player", () =>
    rpc("set_meme_reaction", { ...reaction, active: false, author_user_id: ids.coach }),
  );
  await as("player", () => rpc("set_meme_reaction", { ...reaction, active: false }));
  expect((await as("player", read)).reactions).toHaveLength(2);
  for (const giphy_id of ["😂", "https://evil.test/image.gif", "", "a".repeat(65)])
    await expect(
      as("player", () => rpc("set_meme_reaction", { ...reaction, giphy_id })),
    ).rejects.toThrow("invalid_reaction");
  await expect(
    as("player", () => rpc("set_meme_reaction", { ...reaction, active: "true" })),
  ).rejects.toThrow("invalid_reaction");
  await as("player", () =>
    rpc("set_meme_reaction", { ...reaction, target_type: "event", target_id: event }),
  );
});
it("returns private batched totals, includes replies, excludes deleted comments and counts individual reactions", async () => {
  const counts = { target_type: "post", ids: [otherPost] };
  expect(await as("player", () => rpc("get_discussion_counts", counts))).toEqual({
    [otherPost]: { comment_count: 0, reaction_count: 0 },
  });
  const root = create({ target_id: otherPost });
  await as("player", () => rpc("save_comment", root));
  await as("coach", () =>
    rpc("save_comment", create({ target_id: otherPost, parent_id: root.id })),
  );
  const reaction = { target_type: "post", target_id: otherPost, giphy_id: "SameGif", active: true };
  for (const actor of ["player", "coach"] as const)
    await as(actor, () => rpc("set_meme_reaction", reaction));
  expect(await as("player", () => rpc("get_discussion_counts", counts))).toEqual({
    [otherPost]: { comment_count: 2, reaction_count: 2 },
  });
  await as("player", () => rpc("delete_comment", { ...root, expected_version: 0 }));
  await as("coach", () => rpc("set_meme_reaction", { ...reaction, active: false }));
  expect(await as("coach", () => rpc("get_discussion_counts", counts))).toEqual({
    [otherPost]: { comment_count: 1, reaction_count: 1 },
  });
  expect(
    await as("player", () => rpc("get_discussion_counts", { target_type: "event", ids: [event] })),
  ).toEqual({ [event]: { comment_count: 3, reaction_count: 1 } });
  for (const actor of ["pending", "disabled"] as const)
    await expect(as(actor, () => rpc("get_discussion_counts", counts))).rejects.toThrow(
      "not_authorized",
    );
  await db.exec("set role anon");
  try {
    await expect(rpc("get_discussion_counts", counts)).rejects.toThrow("permission denied");
  } finally {
    await db.exec("reset role");
  }
  await expect(
    as("player", () =>
      rpc("get_discussion_counts", { ...counts, ids: Array(101).fill(otherPost) }),
    ),
  ).rejects.toThrow("too_many_targets");
  await expect(
    as("player", () => rpc("get_discussion_counts", { ...counts, target_type: "invalid" })),
  ).rejects.toThrow("invalid_target");
  expect(await as("player", () => rpc("get_discussion_counts", { ...counts, ids: [] }))).toEqual(
    {},
  );
  await db.query("delete from posts where id=$1", [otherPost]);
});
it("keeps comment and reply memes independent, idempotent, private and scoped to their actual target", async () => {
  const root = create();
  const reply = create({ parent_id: root.id });
  const eventComment = create({ target_type: "event", target_id: event });
  for (const c of [root, reply, eventComment]) await as("player", () => rpc("save_comment", c));
  const react = { ...target, comment_id: root.id, giphy_id: "CommentGIF", active: true };
  for (const actor of ["player", "coach", "admin"] as const)
    await as(actor, () =>
      rpc("set_comment_meme_reaction", { ...react, author_name_snapshot: "forged" }),
    );
  await as("player", () => rpc("set_comment_meme_reaction", react));
  let data = await as("player", read);
  expect(
    data.comments.filter((c) => c.parent_id === root.id && c.giphy_id && !c.deleted_at),
  ).toHaveLength(3);
  expect(
    data.comments
      .filter((c) => c.parent_id === root.id && c.giphy_id && !c.deleted_at)
      .map((r) => r.author_name_snapshot),
  ).toEqual(expect.arrayContaining(["player", "coach", "admin"]));
  await as("player", () => rpc("set_comment_meme_reaction", { ...react, comment_id: reply.id }));
  await as("player", () =>
    rpc("set_comment_meme_reaction", {
      ...react,
      target_type: "event",
      target_id: event,
      comment_id: eventComment.id,
    }),
  );
  await as("player", () =>
    rpc("set_comment_meme_reaction", { ...react, active: false, author_user_id: ids.coach }),
  );
  data = await as("player", read);
  expect(
    data.comments.filter((c) => c.parent_id === root.id && c.giphy_id && !c.deleted_at),
  ).toHaveLength(2);
  expect(
    data.comments.filter((c) => c.parent_id === reply.id && c.giphy_id && !c.deleted_at),
  ).toHaveLength(1);
  const before = await as("player", () =>
    rpc("get_discussion_counts", { target_type: "post", ids: [post] }),
  );
  await as("coach", () => rpc("set_comment_meme_reaction", { ...react, comment_id: reply.id }));
  expect(
    await as("player", () => rpc("get_discussion_counts", { target_type: "post", ids: [post] })),
  ).toEqual(before);
  for (const extra of [{ target_id: otherPost }, { target_type: "event", target_id: event }])
    await expect(
      as("player", () => rpc("set_comment_meme_reaction", { ...react, ...extra })),
    ).rejects.toThrow("invalid_target");
  for (const extra of [{ giphy_id: "https://evil.test/a.gif" }, { active: "true" }])
    await expect(
      as("player", () => rpc("set_comment_meme_reaction", { ...react, ...extra })),
    ).rejects.toThrow("invalid_reaction");
  for (const actor of ["pending", "disabled"] as const) {
    await expect(as(actor, () => rpc("set_comment_meme_reaction", react))).rejects.toThrow(
      "not_authorized",
    );
    expect(
      (await as(actor, () => db.query("select * from comment_meme_reactions"))).rows,
    ).toHaveLength(0);
  }
  await expect(as("admin", () => db.query("delete from comment_meme_reactions"))).rejects.toThrow(
    "permission denied",
  );
  await db.exec("set role anon");
  try {
    await expect(rpc("set_comment_meme_reaction", react)).rejects.toThrow("permission denied");
  } finally {
    await db.exec("reset role");
  }
  await as("player", () => rpc("delete_comment", { ...root, expected_version: 0 }));
  expect(
    (await as("player", read)).comments.filter(
      (c) => c.parent_id === root.id && c.giphy_id && !c.deleted_at,
    ),
  ).toHaveLength(2);
  await expect(as("coach", () => rpc("set_comment_meme_reaction", react))).rejects.toThrow(
    "stale_comment",
  );
  expect(
    (
      await as("player", () =>
        db.query("select * from comment_meme_reactions where comment_id=$1", [root.id]),
      )
    ).rows,
  ).toEqual([]);
});
it("allows text and meme replies to memes, preserves replies on deletion and rejects forged or stale writes", async () => {
  const root = create();
  await as("player", () => rpc("save_comment", root));
  const meme = create({ body: "", giphy_id: "ReplyGif", parent_id: root.id });
  await as("coach", () => rpc("save_comment", meme));
  await as("coach", () => rpc("save_comment", meme));
  const reply = create({ parent_id: meme.id });
  const nestedMeme = create({ body: "", giphy_id: "NestedGif", parent_id: meme.id });
  await as("player", () => rpc("save_comment", reply));
  await as("admin", () => rpc("save_comment", nestedMeme));
  expect((await as("player", read)).comments.filter((c) => c.id === meme.id)).toHaveLength(1);
  for (const extra of [
    { body: "Text and GIF" },
    { giphy_id: "https://bad.test/gif" },
    { parent_id: null },
  ])
    await expect(
      as("coach", () => rpc("save_comment", { ...meme, ...extra, id: randomUUID() })),
    ).rejects.toThrow("invalid_comment");
  await expect(
    as("coach", () =>
      rpc("save_comment", { ...meme, target_type: "event", target_id: event, id: randomUUID() }),
    ),
  ).rejects.toThrow("invalid_parent");
  await expect(
    as("player", () => rpc("delete_comment", { ...meme, expected_version: 0 })),
  ).rejects.toThrow("not_authorized");
  await expect(
    as("coach", () => rpc("save_comment", { ...meme, expected_version: 0 })),
  ).rejects.toThrow("invalid_comment");
  await expect(
    as("coach", () => rpc("delete_comment", { ...meme, expected_version: 1 })),
  ).rejects.toThrow("stale_comment");
  await as("coach", () => rpc("delete_comment", { ...meme, expected_version: 0 }));
  const data = await as("player", read);
  expect(data.comments.find((c) => c.id === meme.id)).toMatchObject({
    giphy_id: null,
    body: "",
    deleted_at: expect.any(String),
  });
  expect(data.comments.find((c) => c.id === nestedMeme.id)?.parent_id).toBe(meme.id);
  expect(data.comments.find((c) => c.id === reply.id)?.body).toBe(reply.body);
  await expect(
    as("player", () => rpc("save_comment", { ...nestedMeme, id: randomUUID() })),
  ).rejects.toThrow("stale_comment");
  for (const actor of ["pending", "disabled"] as const)
    await expect(
      as(actor, () => rpc("save_comment", { ...meme, id: randomUUID() })),
    ).rejects.toThrow("not_authorized");
});
it("removes unanswered memes entirely, but keeps placeholders for text or meme replies", async () => {
  const root = create();
  await as("player", () => rpc("save_comment", root));
  for (const childKind of ["none", "text", "meme"] as const) {
    const meme = create({ parent_id: root.id, body: "", giphy_id: "LeafGif" });
    await as("coach", () => rpc("save_comment", meme));
    const child = create({
      parent_id: meme.id,
      ...(childKind === "meme" ? { body: "", giphy_id: "ChildGif" } : {}),
    });
    if (childKind !== "none") await as("player", () => rpc("save_comment", child));
    await expect(
      as("player", () => rpc("delete_comment", { ...meme, expected_version: 0 })),
    ).rejects.toThrow("not_authorized");
    await expect(
      as("coach", () => rpc("delete_comment", { ...meme, expected_version: 1 })),
    ).rejects.toThrow("stale_comment");
    await as("coach", () => rpc("delete_comment", { ...meme, expected_version: 0 }));
    const data = await as("player", read);
    if (childKind === "none") {
      expect(data.comments.find((c) => c.id === meme.id)).toBeUndefined();
      expect(
        (await db.query("select id from discussion_comments where id=$1", [meme.id])).rows,
      ).toHaveLength(0);
    } else {
      expect(data.comments.find((c) => c.id === meme.id)).toMatchObject({
        deleted_at: expect.any(String),
        giphy_id: null,
      });
      expect(data.comments.find((c) => c.id === child.id)?.parent_id).toBe(meme.id);
    }
  }
  const moderated = create({ parent_id: root.id, body: "", giphy_id: "ModeratedGif" });
  await as("coach", () => rpc("save_comment", moderated));
  await as("admin", () => rpc("delete_comment", { ...moderated, expected_version: 0 }));
  expect((await as("player", read)).comments.find((c) => c.id === moderated.id)).toBeUndefined();
});
it("cascades discussions when their post or event is removed", async () => {
  await db.query("delete from posts where id=$1", [post]);
  await db.query("delete from schedule_events where id=$1", [event]);
  expect((await db.query("select * from discussion_comments")).rows).toHaveLength(0);
  expect((await db.query("select * from meme_reactions")).rows).toHaveLength(0);
  expect((await db.query("select * from comment_meme_reactions")).rows).toHaveLength(0);
});
