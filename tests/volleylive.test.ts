import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadVolleyLiveMatches, type FetchJson } from "@/server/volleylive";

const now = new Date("2026-09-28T12:00:00Z");
const fixture = {
  matchId: 8436854,
  seasonId: 201070,
  tournamentId: 449547,
  tournamentName: "Mizunoligaen - Seriespill - Menn",
  hometeamId: 910930,
  awayteamId: 913823,
  awayteam: "Randaberg - M 1",
  awayteamOrgName: "Randaberg",
  venueId: 3820,
  activityAreaName: "Dragvollhallen A",
  matchDate: "2026-10-03T00:00:00",
  matchStartTime: 1500,
  matchResult: null,
  statusTypeId: 1,
};
const player = {
  personId: 101,
  firstName: "Test",
  lastName: "Spiller",
  number: "8",
  memberType: "Player",
  position: "Libero",
  captain: true,
  birthDate: "2000-01-01",
};
const coach = {
  personId: 102,
  firstName: "Test",
  lastName: "Trener",
  memberType: "TeamSupport",
  position: "Hovedtrener",
};
function source(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    "ta/Seasons/?sportId=157&year=2026": {
      seasons: [
        {
          seasonId: "201070",
          sportId: 157,
          orgIdOwner: 387,
          seasonDateFrom: "06/01/2026 00:00:00",
          seasonDateTo: "05/31/2027 00:00:00",
        },
      ],
    },
    "ta/Seasons/?sportId=157&year=2025": { seasons: [] },
    "ta/Tournament/Season/201070": {
      tournamentsInSeason: [
        {
          tournamentId: 449547,
          tournamentNo: "10101",
          areMatchesPublished: true,
          isDeleted: false,
          sportId: 157,
        },
        {
          tournamentId: 449583,
          tournamentNo: "10202",
          areMatchesPublished: true,
          isDeleted: false,
          sportId: 157,
        },
      ],
    },
    "ta/TournamentMatches/?tournamentId=449547": { matches: [fixture] },
    "ta/TournamentMatches/?tournamentId=449583": { matches: [] },
    ...overrides,
  };
  return vi.fn<FetchJson>(async (path) => {
    if (Object.hasOwn(data, path)) {
      if (data[path] instanceof Error) throw data[path];
      return data[path];
    }
    if (path.startsWith("ta/MatchTeamMembers/")) return [];
    if (path.startsWith("ta/TeamMembers/")) return [player, coach];
    if (path.startsWith("ta/MatchReferee?"))
      return [
        {
          firstName: "Første",
          lastName: "Dommer",
          refereeType: "1.dommer",
          primaryEmail: "private@example.test",
        },
      ];
    throw new Error(`Unexpected source request: ${path}`);
  });
}

it("discovers both competitions and filters by team ID, venue, date and result", async () => {
  const get = source({
    "ta/TournamentMatches/?tournamentId=449547": {
      matches: [
        fixture,
        { ...fixture, matchId: 2, hometeamId: 913823, awayteamId: 910930 },
        { ...fixture, matchId: 3, venueId: 999 },
        { ...fixture, matchId: 4, matchDate: "2026-09-27T00:00:00" },
        { ...fixture, matchId: 5, matchResult: { homeGoals: 3, awayGoals: 0 } },
        { ...fixture, matchId: 6, statusTypeId: 6 },
        { ...fixture, matchId: 7, matchDate: null },
        { ...fixture, matchId: 8, hometeamId: 999, hometeam: "NTNUI" },
        { ...fixture, matchId: 9, matchStartTime: 2560 },
      ],
    },
    "ta/TournamentMatches/?tournamentId=449583": {
      matches: [
        {
          ...fixture,
          matchId: 10,
          tournamentId: 449583,
          tournamentName: "1. divisjon - Kvinner",
          hometeamId: 913824,
          matchDate: "2026-10-25T00:00:00",
          matchStartTime: 1430,
        },
      ],
    },
  });
  const result = await loadVolleyLiveMatches(get, now);
  expect(result.warning).toBeUndefined();
  expect(result.matches.map((m) => m.id)).toEqual(["volleylive-8436854", "volleylive-10"]);
  expect(result.matches.map((m) => m.scheduledAt)).toEqual([
    "2026-10-03T13:00:00.000Z",
    "2026-10-25T13:30:00.000Z",
  ]);
  const match = result.matches[0];
  expect(match.teams[1].name).toBe("Randaberg");
  expect(match.teams[0]).toMatchObject({
    rosterSource: "team",
    coach: "Test Trener",
    captainId: "",
    liberoId: "",
  });
  expect(match.teams[0].players).toHaveLength(1);
  expect(match.teams[0].players[0].starter).toBe(false);
  expect(match.firstReferee).toBe("Første Dommer");
  expect(match.secondReferee).toBe("");
  expect(JSON.stringify(result)).not.toMatch(/birthDate|primaryEmail|private@example/);
  expect(get.mock.calls.filter(([path]) => path === "ta/TeamMembers/913823")).toHaveLength(1);
});

it("uses published match rosters and roles instead of a general roster", async () => {
  const result = await loadVolleyLiveMatches(
    source({
      "ta/MatchTeamMembers/8436854?images=false": [
        { ...player, teamOrgId: 910930 },
        { ...coach, teamOrgId: 910930 },
      ],
    }),
    now,
  );
  const home = result.matches[0].teams[0];
  expect(home.rosterSource).toBe("match");
  expect(home.captainId).toBe(home.players[0].id);
  expect(home.liberoId).toBe(home.players[0].id);
  expect(home.players[0].starter).toBe(false);
});

it("retains fixtures when roster or referee requests fail", async () => {
  const result = await loadVolleyLiveMatches(
    source({
      "ta/MatchTeamMembers/8436854?images=false": new Error("unavailable"),
      "ta/MatchReferee?matchid=8436854": new Error("unavailable"),
      "ta/TeamMembers/910930": new Error("unavailable"),
    }),
    now,
  );
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].importWarning).toBeTruthy();
  expect(result.matches[0].teams[0].players).toEqual([]);
  expect(result.matches[0].teams[1].players).toHaveLength(1);
});

it("keeps valid fixtures when another competition or a source row fails", async () => {
  const result = await loadVolleyLiveMatches(
    source({
      "ta/TournamentMatches/?tournamentId=449547": { matches: [fixture, { matchId: "broken" }] },
      "ta/TournamentMatches/?tournamentId=449583": new Error("unavailable"),
    }),
    now,
  );
  expect(result.matches).toHaveLength(1);
  expect(result.warning).toBeTruthy();
});

it("returns a useful fallback when the source is unavailable", async () => {
  const result = await loadVolleyLiveMatches(async () => {
    throw new Error("offline");
  }, now);
  expect(result.matches).toEqual([]);
  expect(result.warning).toContain("Kunne ikke hente");
});

it.runIf(process.env.SPEAKER_LIVE_CHECK === "1")(
  "imports the current published NTNUI fixtures from the real source",
  async () => {
    const result = await loadVolleyLiveMatches();
    expect(result.warning).toBeUndefined();
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.teams[0].players.length > 0)).toBe(true);
    expect(result.matches.every((m) => !m.importWarning)).toBe(true);
    console.log(
      `Imported ${result.matches.length} matches; next: ${result.matches[0].scheduledAt}, NTNUI – ${result.matches[0].teams[1].name}`,
    );
  },
  120000,
);
