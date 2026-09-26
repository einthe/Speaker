import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const ids = {
  admin: randomUUID(),
  coordinator: randomUUID(),
  player: randomUUID(),
  coach: randomUUID(),
  pending: randomUUID(),
};
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
      name === "pending" ? "pending" : "approved",
    ]);
  }
  await db.query(
    "insert into player_secondary_roles(player_user_id,role_key,assigned_by) values($1,'volunteer_work_coordinator',$2)",
    [ids.coordinator, ids.admin],
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
const save = (points: unknown, expected_version = 0, id = ids.player) =>
  db.query("select set_volunteer_work_points($1::jsonb)", [
    JSON.stringify({ id, points, expected_version }),
  ]);

it("allows admins and coordinators to set and reduce totals with version checks", async () => {
  await as("admin", () => save(12));
  await as("coordinator", () => save(5, 1));
  await expect(as("admin", () => save(30, 1))).rejects.toThrow("stale_record");
  const { rows } = await db.query(
    "select points,version,updated_by from volunteer_work_points where player_user_id=$1",
    [ids.player],
  );
  expect(rows).toEqual([{ points: 5, version: 2, updated_by: ids.coordinator }]);
  await as("coordinator", () => save(0, 2));
});
it("rejects ordinary players, coaches, pending users and anonymous writes", async () => {
  for (const actor of ["player", "coach", "pending"] as const)
    await expect(as(actor, () => save(99, 3))).rejects.toThrow("not_authorized");
  await db.exec("set role anon");
  try {
    await expect(save(99)).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
it("exposes totals to approved members but prevents direct writes and unapproved reads", async () => {
  expect(
    (await as("player", () => db.query("select * from volunteer_work_points"))).rows,
  ).toHaveLength(1);
  expect(
    (await as("pending", () => db.query("select * from volunteer_work_points"))).rows,
  ).toHaveLength(0);
  await expect(
    as("admin", () => db.query("update volunteer_work_points set points=999")),
  ).rejects.toThrow(/permission denied/);
  await expect(
    as("coordinator", () =>
      db.query(
        "insert into volunteer_work_points(player_user_id,points,updated_by) values($1,99,$1)",
        [ids.coordinator],
      ),
    ),
  ).rejects.toThrow(/permission denied/);
});
it("rejects negative, fractional, missing and oversized totals and non-player targets", async () => {
  for (const value of [-1, 1.5, null, "4", 2147483648])
    await expect(as("admin", () => save(value, 3))).rejects.toThrow("invalid_points");
  for (const target of [ids.coach, ids.admin, ids.pending, randomUUID()])
    await expect(as("admin", () => save(1, 0, target))).rejects.toThrow("invalid_player");
});
it("revoking the coordinator role immediately prevents updates", async () => {
  await db.query("delete from player_secondary_roles where player_user_id=$1", [ids.coordinator]);
  await expect(as("coordinator", () => save(42, 3))).rejects.toThrow("not_authorized");
});
