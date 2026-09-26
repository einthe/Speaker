import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/volleyball-matches.json";
import standings from "./fixtures/standings.json";
import { fetchMatches, normalizeMatches, type MatchConfig } from "@/server/volleyball/matches";
import { volleyballTeamName } from "@/lib/volleyball-teams";
import { eventDateLabel } from "@/lib/event-dates";
import type { TeamEvent } from "@/lib/domain";
vi.mock("server-only", () => ({}));
const config: MatchConfig = {
  source: "public",
  tournamentId: 449623,
  seasonId: 201070,
  teamId: 913845,
};
const own = fixture.matches.find((match) => match.awayteamId === config.teamId)!;
const one = (patch = {}) => ({
  tournamentId: config.tournamentId,
  matches: [{ ...own, ...patch }],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("VolleyballLive matches", () => {
  it("selects all 16 NTNUI 2 matches by ID, excluding the other 56 fixtures", () => {
    const matches = normalizeMatches(fixture, config);
    expect(matches).toHaveLength(16);
    expect(matches[0]).toMatchObject({
      external_event_id: "8457476",
      title: "NTNUI D2A – NTNUI D2B",
      opponent: "NTNUI D2B",
      home_away: "neutral",
      starts_at: "2026-10-10T09:00:00.000Z",
      ends_at: "2026-10-10T11:00:00.000Z",
      team_sets: null,
      opponent_sets: null,
    });
    expect(
      matches.every(
        (match) => match.title.startsWith("NTNUI D2A – ") && match.home_away === "neutral",
      ),
    ).toBe(true);
    expect(new Set(matches.map((match) => match.opponent))).toEqual(
      new Set([
        "NTNUI D2B",
        "NTNUI D2C",
        "Trondheim Ballklubb",
        "Trondheim Ballklubb 2",
        "Steinkjer Volleyballklubb",
        "Mosjøen Volleyballklubb",
        "Blussuvoll V.B.K.",
        "Nyborg Idrettslag",
      ]),
    );
    expect(matches.filter((match) => match.time_unknown)).toHaveLength(2);
    expect(matches.some((match) => match.title.includes("NTNUI D2C"))).toBe(true);
  });
  it("maps aliases exactly, supports source variations, and leaves unrelated names alone", () => {
    expect(volleyballTeamName("NTNUI 2")).toBe("NTNUI D2A");
    expect(volleyballTeamName("NTNUI - K 3")).toBe("NTNUI D2B");
    expect(volleyballTeamName("NTNUI 4")).toBe("NTNUI D2C");
    expect(volleyballTeamName("Trondheim Ballklubb - K 2")).toBe("Trondheim Ballklubb 2");
    expect(volleyballTeamName("Steinkjer Volleyballklubb - K1")).toBe("Steinkjer Volleyballklubb");
    expect(volleyballTeamName("Club - a name")).toBe("Club - a name");
    expect(volleyballTeamName("NTNUI 21")).toBe("NTNUI 21");
    expect(volleyballTeamName("Nytt navn", 913845)).toBe("NTNUI D2A");
  });
  it("interprets local HHMM across daylight saving and reverses away results correctly", () => {
    const match = normalizeMatches(
      one({
        matchDate: "2026-11-01T00:00:00",
        matchStartTime: 1330,
        matchEndTime: 1530,
        matchResult: { homeGoals: 1, awayGoals: 3 },
      }),
      config,
    )[0];
    expect(match).toMatchObject({
      starts_at: "2026-11-01T12:30:00.000Z",
      ends_at: "2026-11-01T14:30:00.000Z",
      team_sets: 3,
      opponent_sets: 1,
    });
    expect(
      normalizeMatches(one({ matchResult: { homeGoals: null, awayGoals: 3 } }), config)[0]
        .team_sets,
    ).toBeNull();
  });
  it("does not invent start times or dates and surfaces postponement/cancellation", () => {
    const match = normalizeMatches(one({ matchStartTime: 0, matchEndTime: 0 }), config)[0];
    expect(match).toMatchObject({ time_unknown: true, ends_at: null });
    expect(
      eventDateLabel({ starts_at: match.starts_at, external_time_unknown: true } as TeamEvent),
    ).toContain("Tidspunkt ikke fastsatt");
    expect(normalizeMatches(one({ matchDate: null }), config)[0].starts_at).toBeNull();
    expect(normalizeMatches(one({ nonPlayReason: "MatchPostponed" }), config)[0].status).toBe(
      "postponed",
    );
    expect(normalizeMatches(one({ nonPlayReason: "MatchCancelled" }), config)[0].status).toBe(
      "cancelled",
    );
    expect(normalizeMatches(one({ statusTypeId: 6 }), config)[0].status).toBe("unavailable");
  });
  it("rejects wrong competitions, duplicate matches, bad dates/times and malformed results", () => {
    for (const payload of [
      null,
      {},
      { ...one(), tournamentId: 1 },
      one({ seasonId: 1 }),
      one({ matchDate: "bad" }),
      one({ matchDate: "2026-02-30T00:00:00" }),
      one({ matchStartTime: 1260 }),
      one({ matchResult: { homeGoals: 50, awayGoals: 1 } }),
      { ...one(), matches: [own, own] },
    ]) {
      expect(() => normalizeMatches(payload, config)).toThrow();
    }
  });
  it("uses the same JSON transport as standings and respects publication settings", async () => {
    const metadata = {
      ...standings.tournament,
      areMatchesPublished: true,
      isResultPublished: false,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(Response.json(one({ matchResult: { homeGoals: 3, awayGoals: 1 } })))
      .mockResolvedValueOnce(Response.json([{ orgId: own.hometeamId, orgName: "NTNUI 3" }]));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchMatches(config))[0]).toMatchObject({
      team_sets: null,
      title: "NTNUI D2A – NTNUI D2B",
    });
    expect(fetch.mock.calls[2][0]).toContain("TournamentStandings/");
    expect(fetch.mock.calls[1][0]).toBe(
      "https://sf48-terminlister-prod-app.azurewebsites.net/ta/TournamentMatches/?tournamentId=449623",
    );
    fetch.mockReset().mockResolvedValue(Response.json({ ...metadata, areMatchesPublished: false }));
    await expect(fetchMatches(config)).rejects.toThrow(
      "Kampene fra VolleyballLive kunne ikke oppdateres.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("prefers standings names by team ID over schedule labels", () => {
    const teams = new Map([[own.hometeamId, "Canonical opponent"]]);
    expect(normalizeMatches(one(), config, teams)[0]).toMatchObject({
      title: "NTNUI D2A – Canonical opponent",
      opponent: "Canonical opponent",
      home_away: "neutral",
    });
  });
  it("returns safe errors on upstream failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-token")));
    await expect(fetchMatches(config)).rejects.toThrow(
      "Kampene fra VolleyballLive kunne ikke oppdateres.",
    );
  });
});
