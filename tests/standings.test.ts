import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import fixture from "./fixtures/standings.json";
import { normalizeRows } from "@/server/standings/validation";
import { standingsConfig, StandingsError } from "@/server/standings/config";
import { fetchStandings } from "@/server/standings/client";
vi.mock("server-only", () => ({}));

const config = { source: "public" as const, tournamentId: 449623, seasonId: 201070 };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.stubEnv("NIF_CLIENT_ID", "");
  vi.stubEnv("NIF_CLIENT_SECRET", "");
  vi.stubEnv("VOLLEYBALL_SEASON_ID", "201070");
  vi.stubEnv("VOLLEYBALL_TOURNAMENT_ID", "449623");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("volleyball standings", () => {
  it("accepts the captured public response and keeps official row order and ranks", () => {
    const rows = normalizeRows(fixture.rows);
    expect(rows).toHaveLength(9);
    expect(rows.map((row) => row.id)).toEqual(fixture.rows.map((row) => row.entryId));
    expect(rows.filter((row) => row.team.startsWith("NTNUI")).map((row) => row.team)).toEqual([
      "NTNUI D2A",
      "NTNUI D2B",
      "NTNUI D2C",
    ]);
    const unordered = [fixture.rows[3], fixture.rows[0], fixture.rows[2]];
    expect(normalizeRows(unordered).map((row) => row.rank)).toEqual([4, 1, 3]);
  });
  it("maps volleyball sets separately from rally points without deriving rankings", () => {
    expect(
      normalizeRows([
        {
          ...fixture.rows[0],
          matches: 3,
          victories: 2,
          losses: 1,
          totalPoints: 5,
          goalsScored: 7,
          goalsConceeded: 6,
          goalDifference: 1,
          partialPointsScored: 290,
          partialPointsConceded: 310,
          partialPointsDifference: -20,
        },
      ])[0],
    ).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      points: 5,
      setsWon: 7,
      setsLost: 6,
      setDifference: 1,
      rallyPointsWon: 290,
      rallyPointsLost: 310,
      rallyPointDifference: -20,
    });
  });
  it("keeps absent and null statistics unknown, while preserving zero", () => {
    expect(
      normalizeRows([{ entryId: 1, orgName: "NTNUI", matches: 0, totalPoints: null }])[0],
    ).toMatchObject({ rank: null, played: 0, points: null, setsWon: null, wins: null });
    expect(normalizeRows([])).toEqual([]);
  });
  it.each([
    {},
    null,
    [{ ...fixture.rows[0], matches: "three" }],
    [{ ...fixture.rows[0], orgName: null }],
    [fixture.rows[0], fixture.rows[0]],
  ])("rejects malformed responses safely: %j", (data) => {
    expect(() => normalizeRows(data)).toThrow(StandingsError);
  });
  it("selects public JSON without credentials, NIF with credentials, rejects partial configuration", () => {
    expect(standingsConfig()).toEqual(config);
    vi.stubEnv("NIF_CLIENT_ID", "test-client");
    expect(() => standingsConfig()).toThrow(StandingsError);
    vi.stubEnv("NIF_CLIENT_SECRET", "test-secret");
    expect(standingsConfig()).toEqual({ ...config, source: "nif" });
    vi.stubEnv("VOLLEYBALL_TOURNAMENT_ID", "bad");
    expect(() => standingsConfig()).toThrow(StandingsError);
  });
  it("requests only server JSON and returns a normalized public model", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(fixture.tournament))
      .mockResolvedValueOnce(response(fixture.rows));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchStandings(config);
    expect(result.rows).toHaveLength(9);
    expect(result.tournament).toBe(fixture.tournament.tournamentName);
    expect(result.sourceUrl).toBe(
      "https://kamper.volleyball.no/standings?seasonId=201070&tournamentId=449623",
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://sf48-terminlister-prod-app.azurewebsites.net/ta/Tournament?tournamentId=449623",
      "https://sf48-terminlister-prod-app.azurewebsites.net/ta/TournamentStandings/?tournamentId=449623",
    ]);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it("respects unpublished tables and validates season identity", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ ...fixture.tournament, isTablePublished: false }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchStandings(config)).toMatchObject({ published: false, rows: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(fetchStandings({ ...config, seasonId: 123 })).rejects.toThrow(StandingsError);
  });
  it("sanitizes transport, HTTP and schema failures", async () => {
    for (const failure of [
      () => Promise.reject(new Error("secret-token")),
      () => Promise.resolve(response({ access_token: "secret-token" }, 503)),
      () => Promise.resolve(response({ secret: "secret-token" })),
    ]) {
      vi.stubGlobal("fetch", vi.fn(failure));
      await expect(fetchStandings(config)).rejects.toThrow(
        "Tabellen kunne ikke hentes. Prøv igjen senere.",
      );
    }
  });
  it("keeps credentials and external requests out of client modules", () => {
    function files(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    }
    for (const file of [...files("src/components"), ...files("src/lib")]) {
      if (file.includes("/supabase/")) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /NIF_CLIENT_|NIF_SCOPE|id\.nif\.no|data\.nif\.no|sf48-terminlister/,
      );
    }
    for (const file of files("src/server/standings"))
      expect(readFileSync(file, "utf8"), file).toContain('import "server-only"');
  });
});

describe("NIF OAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NIF_CLIENT_ID", "test-client");
    vi.stubEnv("NIF_CLIENT_SECRET", "test-secret");
  });
  it("shares concurrent token requests, reuses tokens and renews before expiry", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        response({
          access_token: "private-token",
          token_type: "Bearer",
          expires_in: 300,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { accessToken } = await import("@/server/standings/auth");
    expect(await Promise.all([accessToken(), accessToken()])).toEqual([
      "private-token",
      "private-token",
    ]);
    expect(await accessToken()).toBe("private-token");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body.get("scope")).toBe("data_ta_read");
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    vi.setSystemTime(Date.now() + 300_000);
    await accessToken();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("renews on 401 once and never returns tokens to the caller", async () => {
    let tokens = 0;
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("connect/token"))
        return response({
          access_token: `secret-${++tokens}`,
          token_type: "Bearer",
          expires_in: 3600,
        });
      if ((init.headers as Record<string, string>).Authorization === "Bearer secret-1")
        return response({}, 401);
      return response(url.includes("TournamentStandings") ? fixture.rows : fixture.tournament);
    });
    vi.stubGlobal("fetch", fetch);
    const { fetchStandings: read } = await import("@/server/standings/client");
    const data = await read({ ...config, source: "nif" });
    expect(tokens).toBe(2);
    expect(data.rows).toHaveLength(9);
    expect(JSON.stringify(data)).not.toMatch(/secret-|test-client/);
    expect(fetch.mock.calls.some(([url]) => url.startsWith("https://data.nif.no/api/v1/ta/"))).toBe(
      true,
    );
  });
  it("fails safely on token denial and persistent API rejection without a retry loop", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ error_description: "test-secret" }, 401));
    vi.stubGlobal("fetch", fetch);
    const { fetchStandings: read } = await import("@/server/standings/client");
    await expect(read({ ...config, source: "nif" })).rejects.toThrow("Tabellen kunne ikke hentes.");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch
      .mockReset()
      .mockImplementation(async (url: string) =>
        url.includes("connect/token")
          ? response({ access_token: "bad-token", token_type: "Bearer", expires_in: 300 })
          : response({}, 401),
      );
    await expect(read({ ...config, source: "nif" })).rejects.toThrow("Tabellen kunne ikke hentes.");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
