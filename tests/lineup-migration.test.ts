import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

it("upgrades an existing published lineup without changing its historical snapshots", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/202609190001_initial.sql", "utf8"));
    const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-a000-00000000000${i + 1}`);
    for (const [i, id] of ids.entries()) {
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        `legacy${i}@example.test`,
        JSON.stringify({ full_name: `Legacy ${i}` }),
      ]);
      await db.query(
        "update profiles set base_role=$1::public.base_role,account_status='approved' where id=$2",
        [i ? "player" : "coach", id],
      );
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[0]]);
    const match = (
      await db.query<{ id: string }>("select save_event($1::jsonb) as id", [
        JSON.stringify({
          event_type: "match",
          title: "Legacy match",
          starts_at: "2027-01-01T18:00:00Z",
          opponent: "Legacy opponent",
          home_away: "home",
        }),
      ])
    ).rows[0].id;
    await db.query("select save_lineup($1::jsonb)", [
      JSON.stringify({
        match_id: match,
        expected_revision: 0,
        publish: true,
        slots: ids
          .slice(1)
          .map((id, i) => ({ player_user_id: id, court_position: i + 1, is_libero: false })),
      }),
    ]);
    const slots = (
      await db.query(
        "select to_jsonb(s) as snapshot from lineup_revision_slots s order by court_position",
      )
    ).rows;
    const revisions = (await db.query("select to_jsonb(r) as revision from lineup_revisions r"))
      .rows;
    await db.exec(
      readFileSync("supabase/migrations/202609200001_lineup_roles_and_event_authors.sql", "utf8"),
    );
    expect(
      (
        await db.query(
          "select to_jsonb(s)-'lineup_role' as snapshot from lineup_revision_slots s order by court_position",
        )
      ).rows,
    ).toEqual(slots);
    expect(
      (await db.query("select to_jsonb(r)-'setter_position' as revision from lineup_revisions r"))
        .rows,
    ).toEqual(revisions);
    expect((await db.query("select setter_position from lineup_revisions")).rows).toEqual([
      { setter_position: null },
    ]);
    expect((await db.query("select creator_base_role_snapshot from schedule_events")).rows).toEqual(
      [{ creator_base_role_snapshot: "coach" }],
    );
  } finally {
    await db.close();
  }
});
