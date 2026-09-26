import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("upgrades existing match names and venues without changing IDs or manually written titles", async () => {
  const db = new PGlite();
  const migration = "202609200004_match_display.sql";
  try {
    await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
    for (const file of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f < migration)
      .sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`
      insert into auth.users values('00000000-0000-4000-a000-000000000001','coach@example.test','{"full_name":"Coach"}');
      insert into schedule_events(id,event_type,title,starts_at,created_by_user_id,external_source,external_event_id) values
       ('00000000-0000-4000-a000-000000000002','match','Trondheim Ballklubb - K 2 – NTNUI D2A',now(),null,'volleyballlive','legacy-1'),
       ('00000000-0000-4000-a000-000000000003','match','Steinkjer Volleyballklubb - K1 – NTNUI D2A',now(),null,'volleyballlive','legacy-2'),
       ('00000000-0000-4000-a000-000000000004','match','Min egen kamptittel',now(),'00000000-0000-4000-a000-000000000001',null,null);
      insert into match_details(event_id,opponent,home_away) values
       ('00000000-0000-4000-a000-000000000002','Trondheim Ballklubb - K 2','away'),
       ('00000000-0000-4000-a000-000000000003','Steinkjer Volleyballklubb - K1','home'),
       ('00000000-0000-4000-a000-000000000004','Lokal motstander','home');
    `);
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    const { rows } = await db.query(
      "select e.id,e.title,m.opponent,m.home_away from schedule_events e join match_details m on m.event_id=e.id order by e.id",
    );
    expect(rows).toEqual([
      {
        id: "00000000-0000-4000-a000-000000000002",
        title: "NTNUI D2A – Trondheim Ballklubb 2",
        opponent: "Trondheim Ballklubb 2",
        home_away: "neutral",
      },
      {
        id: "00000000-0000-4000-a000-000000000003",
        title: "NTNUI D2A – Steinkjer Volleyballklubb",
        opponent: "Steinkjer Volleyballklubb",
        home_away: "neutral",
      },
      {
        id: "00000000-0000-4000-a000-000000000004",
        title: "Min egen kamptittel",
        opponent: "Lokal motstander",
        home_away: "neutral",
      },
    ]);
  } finally {
    await db.close();
  }
});
