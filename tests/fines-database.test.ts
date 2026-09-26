import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const ids = {
  admin: randomUUID(),
  manager: randomUUID(),
  player: randomUUID(),
  coach: randomUUID(),
  pending: randomUUID(),
  disabled: randomUUID(),
};
let type: string;
const rpc = async <T = unknown>(name: string, data?: unknown) =>
  (
    await db.query<{ result: T }>(
      `select public.${name}(${data === undefined ? "" : "$1::jsonb"}) as result`,
      data === undefined ? [] : [JSON.stringify(data)],
    )
  ).rows[0].result;
async function as<T>(actor: keyof typeof ids | null, work: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ? ids[actor] : ""]);
  await db.exec(`set role ${actor ? "authenticated" : "anon"}`);
  try {
    return await work();
  } finally {
    await db.exec("reset role");
  }
}
const fine = (user = ids.player, extra = {}) => ({
  id: randomUUID(),
  user_id: user,
  fine_type_id: type,
  expected_type_version: 0,
  note: "Eksempel",
  ...extra,
});
const typeData = (extra = {}) => ({
  name: "For sent",
  description: "Etter start",
  amount_ore: 5025,
  active: true,
  ...extra,
});
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
  await as("admin", () =>
    rpc("manage_user", {
      id: ids.manager,
      full_name: "Botsjef",
      base_role: "player",
      account_status: "approved",
      roles: ["fine_manager"],
      jersey_number: null,
    }),
  );
  type = await as("manager", () => rpc<string>("save_fine_type", typeData()));
});
afterAll(() => db.close());

it("sorts members by totals, includes zeroes/coaches, excludes admins and preserves retry safety", async () => {
  const input = fine();
  await as("manager", () => rpc("apply_fine", input));
  await as("manager", () => rpc("apply_fine", input));
  await as("admin", () => rpc("apply_fine", fine(ids.coach)));
  await as("admin", () => rpc("apply_fine", fine(ids.coach)));
  const result = await as("player", () => rpc<import("@/lib/fines").Fines>("get_fines"));
  expect(result.members.map((m: { id: string; total_ore: number }) => [m.id, m.total_ore])).toEqual(
    [
      [ids.coach, 10050],
      [ids.player, 5025],
      [ids.manager, 0],
    ],
  );
  expect(result.members[1].fines).toHaveLength(1);
  await expect(
    as("manager", () => rpc("apply_fine", { ...input, note: "Changed" })),
  ).rejects.toThrow("invalid_fine_request");
});
it("prevents non-manager writes, direct writes and unapproved reads", async () => {
  for (const actor of [null, "player", "coach", "pending", "disabled"] as const) {
    await expect(as(actor, () => rpc("apply_fine", fine()))).rejects.toThrow();
    await expect(
      as(actor, () => rpc("save_fine_type", typeData({ name: "Not allowed" }))),
    ).rejects.toThrow();
    await expect(
      as(actor, () => rpc("save_fine_rules", { body: "Changed", expected_version: 0 })),
    ).rejects.toThrow();
  }
  await expect(
    as("manager", () => db.exec("update public.fines set amount_ore=1")),
  ).rejects.toThrow(/permission denied/);
  await expect(as("admin", () => db.exec("delete from public.fine_types"))).rejects.toThrow(
    /permission denied/,
  );
  for (const actor of ["pending", "disabled"] as const) {
    expect((await as(actor, () => db.query("select * from public.fines"))).rows).toHaveLength(0);
    await expect(as(actor, () => rpc<import("@/lib/fines").Fines>("get_fines"))).rejects.toThrow(
      "not_authorized",
    );
  }
});
it("refuses admins and inactive accounts as fine recipients and ignores client-supplied amounts", async () => {
  for (const user of [ids.admin, ids.pending, ids.disabled])
    await expect(as("manager", () => rpc("apply_fine", fine(user)))).rejects.toThrow(
      "invalid_fine_recipient",
    );
  const input = fine(ids.manager, { amount_ore: 1, type_name_snapshot: "Forged" });
  await as("admin", () => rpc("apply_fine", input));
  const saved = (
    await db.query("select amount_ore,type_name_snapshot from fines where id=$1", [input.id])
  ).rows[0];
  expect(saved).toEqual({ amount_ore: 5025, type_name_snapshot: "For sent" });
});
it("preserves historical prices, detects stale edits and blocks inactive types", async () => {
  await as("manager", () =>
    rpc("save_fine_type", typeData({ id: type, amount_ore: 10000, expected_version: 0 })),
  );
  expect((await db.query("select distinct amount_ore from fines")).rows).toEqual([
    { amount_ore: 5025 },
  ]);
  await expect(as("manager", () => rpc("apply_fine", fine()))).rejects.toThrow("stale_record");
  await expect(
    as("manager", () => rpc("save_fine_type", typeData({ id: type, expected_version: 0 }))),
  ).rejects.toThrow("stale_record");
  await as("manager", () =>
    rpc("save_fine_type", typeData({ id: type, active: false, expected_version: 1 })),
  );
  await expect(
    as("manager", () => rpc("apply_fine", fine(ids.player, { expected_type_version: 2 }))),
  ).rejects.toThrow("invalid_fine_type");
});
it("annuls mistakes without deleting history and does not subtract twice", async () => {
  const id = (await db.query<{ id: string }>("select id from fines where user_id=$1", [ids.player]))
    .rows[0].id;
  const cancel = () => db.query("select public.cancel_fine($1::uuid)", [id]);
  await expect(as("player", cancel)).rejects.toThrow("not_authorized");
  await as("manager", cancel);
  await as("admin", cancel);
  const member = (
    await as("player", () => rpc<import("@/lib/fines").Fines>("get_fines"))
  ).members.find((m: { id: string }) => m.id === ids.player);
  expect(member!.total_ore).toBe(0);
  expect(member!.fines).toHaveLength(1);
  expect(member!.fines[0].cancelled_at).toBeTruthy();
});
it("saves rules safely and supports posts from the new role", async () => {
  await as("manager", () => rpc("save_fine_rules", { body: "Lagets regler", expected_version: 0 }));
  await expect(
    as("admin", () => rpc("save_fine_rules", { body: "Old edit", expected_version: 0 })),
  ).rejects.toThrow("stale_record");
  expect((await as("coach", () => rpc<import("@/lib/fines").Fines>("get_fines"))).rules.body).toBe(
    "Lagets regler",
  );
  const post = await as("manager", () =>
    rpc("save_post", { title: "Bøter", body: "Nye botregler", role_context: "fine_manager" }),
  );
  expect(
    (await db.query("select secondary_role_context_label_snapshot from posts where id=$1", [post]))
      .rows[0],
  ).toEqual({ secondary_role_context_label_snapshot: "Botsjef" });
});
it("validates multipliers, calculates amounts on the server and preserves multiplier snapshots", async () => {
  const typeId = await as("admin", () =>
    rpc<string>("save_fine_type", typeData({ name: "Multiplier test", amount_ore: 5000 })),
  );
  const rule = { name: "Kampdag", description: "Double", factor: 2, active: true };
  for (const actor of [null, "player", "coach", "pending", "disabled"] as const)
    await expect(as(actor, () => rpc("save_fine_multiplier", rule))).rejects.toThrow();
  for (const factor of [0, -1, 1.001, 101, "2"])
    await expect(
      as("manager", () => rpc("save_fine_multiplier", { ...rule, factor })),
    ).rejects.toThrow();
  const multiplier = await as("manager", () => rpc<string>("save_fine_multiplier", rule));
  await expect(
    as("manager", () => db.exec("update fine_multipliers set factor=50")),
  ).rejects.toThrow(/permission denied/);
  const input = {
    ...fine(),
    fine_type_id: typeId,
    multiplier_id: multiplier,
    expected_multiplier_version: 0,
    amount_ore: 1,
    multiplier_factor_snapshot: 99,
  };
  await as("manager", () => rpc("apply_fine", input));
  await as("manager", () => rpc("apply_fine", input));
  const get = async () =>
    (
      await db.query<
        Pick<
          import("@/lib/fines").Fine,
          | "amount_ore"
          | "base_amount_ore"
          | "multiplier_factor_snapshot"
          | "multiplier_name_snapshot"
        >
      >(
        "select amount_ore,base_amount_ore,multiplier_factor_snapshot,multiplier_name_snapshot from fines where id=$1",
        [input.id],
      )
    ).rows;
  expect(await get()).toEqual([
    {
      amount_ore: 10000,
      base_amount_ore: 5000,
      multiplier_factor_snapshot: "2",
      multiplier_name_snapshot: "Kampdag",
    },
  ]);
  await expect(
    as("manager", () =>
      rpc("apply_fine", {
        ...input,
        multiplier_id: undefined,
        expected_multiplier_version: undefined,
      }),
    ),
  ).rejects.toThrow("invalid_fine_request");
  await as("admin", () =>
    rpc("save_fine_multiplier", {
      ...rule,
      id: multiplier,
      name: "Ny kampdag",
      factor: 3,
      expected_version: 0,
    }),
  );
  expect((await get())[0].amount_ore).toBe(10000);
  expect((await get())[0].multiplier_name_snapshot).toBe("Kampdag");
  await as("manager", () => rpc("apply_fine", input));
  await expect(
    as("manager", () => rpc("apply_fine", { ...input, id: randomUUID() })),
  ).rejects.toThrow("stale_record");
  await expect(
    as("admin", () =>
      rpc("save_fine_multiplier", { ...rule, id: multiplier, expected_version: 0 }),
    ),
  ).rejects.toThrow("stale_record");
  const regular = { ...fine(), fine_type_id: typeId };
  await as("manager", () => rpc("apply_fine", regular));
  expect(
    (
      await db.query(
        "select amount_ore,multiplier_factor_snapshot,multiplier_name_snapshot from fines where id=$1",
        [regular.id],
      )
    ).rows[0],
  ).toEqual({
    amount_ore: 5000,
    multiplier_factor_snapshot: "1",
    multiplier_name_snapshot: "Vanlig",
  });
  const bigType = await as("admin", () =>
    rpc<string>("save_fine_type", typeData({ name: "Large fine", amount_ore: 100000000 })),
  );
  await expect(
    as("manager", () =>
      rpc("apply_fine", {
        ...input,
        id: randomUUID(),
        fine_type_id: bigType,
        expected_multiplier_version: 1,
      }),
    ),
  ).rejects.toThrow("fine_amount_too_large");
  await as("manager", () =>
    rpc("save_fine_multiplier", { ...rule, id: multiplier, active: false, expected_version: 1 }),
  );
  await expect(
    as("manager", () =>
      rpc("apply_fine", { ...input, id: randomUUID(), expected_multiplier_version: 2 }),
    ),
  ).rejects.toThrow("invalid_fine_multiplier");
  const catalog = await as("player", () => rpc<import("@/lib/fines").Fines>("get_fines"));
  expect(catalog.multipliers.find((m) => m.id === multiplier)?.active).toBe(false);
});
it("applies decimal multipliers with exact øre rounding and preserves stored snapshots", async () => {
  const typeId = await as("admin", () =>
    rpc<string>("save_fine_type", typeData({ name: "Decimal fine", amount_ore: 2500 })),
  );
  const rule = { name: "Decimal rule", description: "", factor: 1.5, active: true };
  const multiplier = await as("manager", () => rpc<string>("save_fine_multiplier", rule));
  const input = {
    ...fine(),
    fine_type_id: typeId,
    multiplier_id: multiplier,
    expected_multiplier_version: 0,
  };
  await as("manager", () => rpc("apply_fine", input));
  await as("manager", () => rpc("apply_fine", input));
  const records = await db.query(
    "select amount_ore,multiplier_factor_snapshot from fines where id=$1",
    [input.id],
  );
  expect(records.rows).toEqual([{ amount_ore: 3750, multiplier_factor_snapshot: "1.5" }]);
  const data = await as("player", () => rpc<import("@/lib/fines").Fines>("get_fines"));
  expect(data.multipliers.find((m) => m.id === multiplier)?.factor).toBe(1.5);
  await as("manager", () =>
    rpc("save_fine_multiplier", { ...rule, id: multiplier, factor: 0.5, expected_version: 0 }),
  );
  await expect(
    as("manager", () => rpc("apply_fine", { ...input, id: randomUUID() })),
  ).rejects.toThrow("stale_record");
  const reduced = { ...input, id: randomUUID(), expected_multiplier_version: 1 };
  await as("manager", () => rpc("apply_fine", reduced));
  expect(
    (await db.query("select amount_ore from fines where id=$1", [reduced.id])).rows[0],
  ).toEqual({ amount_ore: 1250 });
  const tinyType = await as("admin", () =>
    rpc<string>("save_fine_type", typeData({ name: "Rounding fine", amount_ore: 1 })),
  );
  await as("manager", () =>
    rpc("save_fine_multiplier", { ...rule, id: multiplier, factor: 1.5, expected_version: 1 }),
  );
  const rounded = {
    ...input,
    id: randomUUID(),
    fine_type_id: tinyType,
    expected_multiplier_version: 2,
  };
  await as("manager", () => rpc("apply_fine", rounded));
  expect(
    (await db.query("select amount_ore from fines where id=$1", [rounded.id])).rows[0],
  ).toEqual({ amount_ore: 2 });
  await as("manager", () =>
    rpc("save_fine_multiplier", { ...rule, id: multiplier, factor: 0.01, expected_version: 2 }),
  );
  await expect(
    as("manager", () =>
      rpc("apply_fine", { ...rounded, id: randomUUID(), expected_multiplier_version: 3 }),
    ),
  ).rejects.toThrow("fine_amount_too_small");
});
it("revoking the fine-manager role removes write access immediately", async () => {
  await db.query("delete from player_secondary_roles where player_user_id=$1", [ids.manager]);
  await expect(
    as("manager", () => rpc("save_fine_type", typeData({ name: "Revoked" }))),
  ).rejects.toThrow("not_authorized");
});
