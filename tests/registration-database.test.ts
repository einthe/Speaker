import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const admin = randomUUID();
const teammate = randomUUID();
async function register(registration?: unknown) {
  const id = randomUUID();
  await db.query("insert into auth.users values($1,$2,$3)", [
    id,
    `${id}@example.test`,
    JSON.stringify({
      full_name: "New Member",
      base_role: "admin",
      account_status: "approved",
      registration,
    }),
  ]);
  return id;
}
async function as<T>(id: string | null, fn: () => Promise<T>) {
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (const [id, role] of [
    [admin, "admin"],
    [teammate, "player"],
  ]) {
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      `${id}@example.test`,
      '{"full_name":"Existing Member"}',
    ]);
    await db.query("update profiles set base_role=$2,account_status='approved' where id=$1", [
      id,
      role,
    ]);
  }
});
afterAll(() => db.close());

it("stores signup choices separately and requires admin approval to activate them", async () => {
  const request = {
    base_role: "player",
    jersey_number: 24,
    roles: ["fine_manager", "social_media_manager"],
  };
  const id = await register(request);
  expect(
    (await db.query("select base_role,account_status from profiles where id=$1", [id])).rows[0],
  ).toEqual({ base_role: null, account_status: "pending" });
  expect(
    (await db.query("select * from player_profiles where user_id=$1", [id])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from player_secondary_roles where player_user_id=$1", [id])).rows,
  ).toHaveLength(0);
  expect(
    (await as(id, () => db.query("select public.can_manage_fines() as allowed"))).rows[0],
  ).toEqual({ allowed: false });
  const { rows } = await as(admin, () =>
    db.query<{ registration_request: typeof request }>(
      "select registration_request from public.admin_users() where id=$1",
      [id],
    ),
  );
  expect(rows[0].registration_request).toEqual({
    ...request,
    roles: expect.arrayContaining(request.roles),
  });
  await as(admin, () =>
    db.query("select public.manage_user($1::jsonb)", [
      JSON.stringify({ ...request, id, full_name: "New Member", account_status: "approved" }),
    ]),
  );
  expect(
    (await as(id, () => db.query("select public.can_manage_fines() as allowed"))).rows[0],
  ).toEqual({ allowed: true });
  expect(
    (await db.query("select jersey_number from player_profiles where user_id=$1", [id])).rows[0],
  ).toEqual({ jersey_number: 24 });
});

it("stores coaches without player fields and supports legacy registrations", async () => {
  const id = await register({ base_role: "coach", jersey_number: 24, roles: ["fine_manager"] });
  expect(
    (
      await db.query(
        "select base_role,jersey_number,to_jsonb(roles) as roles from registration_requests where user_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ base_role: "coach", jersey_number: null, roles: [] });
  const legacy = await register();
  expect(
    (await db.query("select * from registration_requests where user_id=$1", [legacy])).rows,
  ).toHaveLength(0);
});

it("rejects forged leadership/admin choices and invalid player jerseys at the database boundary", async () => {
  const request = { base_role: "player", jersey_number: 24, roles: [] };
  for (const role of ["captain", "vice_captain", "admin"])
    await expect(register({ ...request, roles: [role] })).rejects.toThrow();
  await expect(register({ ...request, base_role: "admin" })).rejects.toThrow();
  for (const jersey_number of [null, -1, 100, 1.5, "24"])
    await expect(register({ ...request, jersey_number })).rejects.toThrow();
});

it("keeps choices private and immutable even if user metadata changes", async () => {
  const id = await register({ base_role: "player", jersey_number: 25, roles: [] });
  expect(
    (await as(id, () => db.query("select * from registration_requests where user_id=$1", [id])))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await as(teammate, () =>
        db.query("select * from registration_requests where user_id=$1", [id]),
      )
    ).rows,
  ).toHaveLength(0);
  await expect(as(null, () => db.query("select * from registration_requests"))).rejects.toThrow();
  await expect(
    as(id, () =>
      db.query("update registration_requests set base_role='coach' where user_id=$1", [id]),
    ),
  ).rejects.toThrow();
  await expect(as(id, () => db.query("select * from public.admin_users()"))).rejects.toThrow();
  await db.query("update auth.users set raw_user_meta_data=$2 where id=$1", [
    id,
    JSON.stringify({ registration: { base_role: "coach" } }),
  ]);
  expect(
    (await db.query("select base_role from registration_requests where user_id=$1", [id])).rows[0],
  ).toEqual({ base_role: "player" });
});

it("does not reserve jerseys during signup and reports conflicts atomically at approval", async () => {
  await db.query("insert into player_profiles(user_id,jersey_number) values($1,26)", [teammate]);
  const request = { base_role: "player", jersey_number: 26, roles: [] };
  const id = await register(request);
  await expect(
    as(admin, () =>
      db.query("select public.manage_user($1::jsonb)", [
        JSON.stringify({ ...request, id, full_name: "Other Member", account_status: "approved" }),
      ]),
    ),
  ).rejects.toThrow(/unique/);
  expect((await db.query("select account_status from profiles where id=$1", [id])).rows[0]).toEqual(
    { account_status: "pending" },
  );
});
