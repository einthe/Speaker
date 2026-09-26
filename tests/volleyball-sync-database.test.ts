import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fixture from "./fixtures/volleyball-matches.json";
import { normalizeMatches } from "@/server/volleyball/matches";
vi.mock("server-only", () => ({}));
const db = new PGlite();
const key = "201070:449623:913845";
const matches = normalizeMatches(fixture, {
  source: "public",
  seasonId: 201070,
  tournamentId: 449623,
  teamId: 913845,
});
const coach = "00000000-0000-4000-a000-000000000001";
const sql = (query: string, args?: unknown[]) => db.query<Record<string, unknown>>(query, args);
async function rpc(name: string, data: unknown) {
  return (
    await db.query<{ result: string | number | null }>(
      `select public.${name}($1::jsonb) as result`,
      [JSON.stringify(data)],
    )
  ).rows[0].result;
}
async function claim() {
  return rpc("claim_volleyball_sync", { sync_key: key });
}
async function finish(lease: unknown, rows = matches) {
  return rpc("finish_volleyball_sync", {
    sync_key: key,
    lease_id: lease,
    matches: rows,
    source_url: "https://kamper.volleyball.no/schedule?seasonId=201070&tournamentId=449623",
  });
}
async function due() {
  await sql(
    "update volleyball_sync_state set next_attempt_at=now()-interval '1 day' where sync_key=$1",
    [key],
  );
}
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await sql("insert into auth.users values($1,$2,$3)", [
    coach,
    "coach@example.test",
    JSON.stringify({ full_name: "Coach" }),
  ]);
  await sql("update profiles set base_role='coach',account_status='approved' where id=$1", [coach]);
});
afterAll(() => db.close());

it("allows only the service role to acquire sync leases", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(claim()).rejects.toThrow(/permission denied/);
    await expect(finish(coach)).rejects.toThrow(/permission denied/);
    await expect(sql("select * from volleyball_sync_state")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  expect(await claim()).toBeTypeOf("string");
  expect(await claim()).toBeNull();
  await db.exec("reset role");
  await sql("update volleyball_sync_state set lease_until=now()-interval '1 minute'");
});

it("imports the 16 real fixtures every five minutes and preserves IDs and draft lineups on update", async () => {
  expect(await finish(await claim())).toBe(16);
  expect(
    (
      await sql(
        "select extract(epoch from next_attempt_at-last_success_at)::int as seconds from volleyball_sync_state where sync_key=$1",
        [key],
      )
    ).rows[0].seconds,
  ).toBe(300);
  expect(await claim()).toBeNull();
  const before = (
    await sql("select id,external_event_id from schedule_events order by external_event_id")
  ).rows;
  expect(before).toHaveLength(16);
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [coach]);
  await db.exec("set role authenticated");
  await rpc("save_lineup", {
    match_id: before[0].id,
    expected_revision: 0,
    setter_position: 1,
    slots: [],
    publish: false,
  });
  await db.exec("reset role");
  await due();
  const changed = matches.map((m, i) =>
    i
      ? m
      : {
          ...m,
          location: "Ny hall",
          starts_at: "2026-10-11T12:00:00.000Z",
          ends_at: "2026-10-11T14:00:00.000Z",
          team_sets: 3,
          opponent_sets: 1,
        },
  );
  await finish(await claim(), changed);
  expect(
    (await sql("select id,external_event_id from schedule_events order by external_event_id")).rows,
  ).toEqual(before);
  expect((await sql("select * from lineup_revisions")).rows).toHaveLength(1);
  expect(
    (await sql("select location from schedule_events where id=$1", [before[0].id])).rows[0]
      .location,
  ).toBe("Ny hall");
  expect(
    (await sql("select team_sets from match_details where event_id=$1", [before[0].id])).rows[0]
      .team_sets,
  ).toBe(3);
});

it("rejects edits, deletion and calls to hidden manual helpers while allowing lineups", async () => {
  const event = (await sql("select id from schedule_events limit 1")).rows[0];
  await db.exec("set role authenticated");
  await expect(rpc("save_event", { id: event.id })).rejects.toThrow("external_event_readonly");
  await expect(sql("select delete_event($1::uuid)", [event.id])).rejects.toThrow(
    "external_event_readonly",
  );
  await expect(rpc("save_manual_event", { id: event.id })).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
});

it("keeps unavailable matches and history; failed or expired syncs cannot overwrite good data", async () => {
  await due();
  const lease = await claim();
  await expect(finish(coach, [])).rejects.toThrow("sync_lease_expired");
  await rpc("finish_volleyball_sync", { sync_key: key, lease_id: lease, failed: true });
  const retrySeconds = Number(
    (
      await sql(
        "select extract(epoch from next_attempt_at-now()) as seconds from volleyball_sync_state where sync_key=$1",
        [key],
      )
    ).rows[0].seconds,
  );
  expect(retrySeconds).toBeGreaterThan(290);
  expect(retrySeconds).toBeLessThanOrEqual(300);
  expect((await sql("select count(*)::int as count from schedule_events")).rows[0].count).toBe(16);
  expect(await claim()).toBeNull();
  await due();
  await finish(await claim(), matches.slice(1));
  expect(
    (
      await sql("select external_status from schedule_events where external_event_id=$1", [
        matches[0].external_event_id,
      ])
    ).rows[0].external_status,
  ).toBe("unavailable");
  expect((await sql("select * from lineup_revisions")).rows).toHaveLength(1);
});

it("shortens existing daily cooldowns without releasing an active worker's lease", async () => {
  await db.exec("begin");
  try {
    await sql(
      "insert into volleyball_sync_state(sync_key,next_attempt_at,last_success_at,lease_id,lease_until) values ('old-daily',now()+interval '1 day',now()-interval '10 minutes',$1,now()+interval '1 minute')",
      [coach],
    );
    await db.exec(readFileSync("supabase/migrations/202609230004_volleyball_refresh.sql", "utf8"));
    expect(
      (
        await sql(
          "select next_attempt_at<=now() as due,lease_id,lease_until>now() as leased from volleyball_sync_state where sync_key='old-daily'",
        )
      ).rows[0],
    ).toEqual({ due: true, lease_id: coach, leased: true });
    expect(await rpc("claim_volleyball_sync", { sync_key: "old-daily" })).toBeNull();
    await sql(
      "update volleyball_sync_state set lease_until=now()-interval '1 second' where sync_key='old-daily'",
    );
    expect(await rpc("claim_volleyball_sync", { sync_key: "old-daily" })).toBeTypeOf("string");
  } finally {
    await db.exec("rollback");
  }
});

it("rolls back the entire batch on invalid data and supports undated fixtures", async () => {
  await due();
  const lease = await claim();
  await expect(
    finish(lease, [...matches, { ...matches[0], external_event_id: "bad", opponent: "" }]),
  ).rejects.toThrow();
  expect((await sql("select count(*)::int as count from schedule_events")).rows[0].count).toBe(16);
  await finish(lease, [{ ...matches[0], starts_at: null, ends_at: null, time_unknown: true }]);
  expect(
    (
      await sql("select starts_at from schedule_events where external_event_id=$1", [
        matches[0].external_event_id,
      ])
    ).rows[0].starts_at,
  ).toBeNull();
});

it("preserves a coach's custom title through imports, rejects stale or unauthorized edits, and forces neutral venues", async () => {
  const event = (
    await sql("select id,updated_at from schedule_events where external_event_id=$1", [
      matches[0].external_event_id,
    ])
  ).rows[0];
  const input = {
    id: event.id,
    expected_updated_at: (event.updated_at as Date).toISOString(),
    title: "NTNUI D2B – NTNUI D2A (endret)",
  };
  await db.exec("set role authenticated");
  expect(await rpc("set_imported_match_title", input)).toBe(event.id);
  await expect(rpc("set_imported_match_title", input)).rejects.toThrow("stale_record");
  await db.exec("reset role");
  await due();
  await finish(await claim());
  const updated = (
    await sql("select title,external_title_override from schedule_events where id=$1", [event.id])
  ).rows[0];
  expect(updated).toEqual({ title: input.title, external_title_override: input.title });
  await sql("update match_details set home_away='away' where event_id=$1", [event.id]);
  expect((await sql("select distinct home_away from match_details")).rows).toEqual([
    { home_away: "neutral" },
  ]);
  await sql("update profiles set base_role='player' where id=$1", [coach]);
  await db.exec("set role authenticated");
  await expect(rpc("set_imported_match_title", input)).rejects.toThrow("not_authorized");
  await db.exec("reset role");
});
