import "server-only";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { toUTC } from "@/lib/dates";
import { volleyballTeamName } from "@/lib/volleyball-teams";
import { standingsConfig } from "@/server/standings/config";
import { tournamentSchema } from "@/server/standings/validation";
import { readTournamentApi } from "./client";

export class MatchSyncError extends Error {
  constructor() {
    super("Kampene fra VolleyballLive kunne ikke oppdateres.");
  }
}

export function matchConfig() {
  return {
    ...standingsConfig(),
    teamId: z.coerce
      .number()
      .int()
      .positive()
      .parse(process.env.VOLLEYBALL_TEAM_ID ?? "913845"),
  };
}
export type MatchConfig = ReturnType<typeof matchConfig>;
const integer = z.number().int().safe();
const score = integer.min(0).max(3).nullable();
const matchSchema = z.object({
  matchId: integer.positive(),
  tournamentId: integer.positive(),
  seasonId: integer.positive(),
  sportId: z.literal(157),
  hometeamId: integer.positive(),
  awayteamId: integer.positive(),
  hometeam: z.string().min(1),
  awayteam: z.string().min(1),
  hometeamOverriddenName: z.string().nullish(),
  awayteamOverriddenName: z.string().nullish(),
  matchDate: z.string().nullable(),
  matchStartTime: integer.min(0).max(2359),
  matchEndTime: integer.min(0).max(2359),
  activityAreaName: z.string().max(200).nullish(),
  matchResult: z.object({ homeGoals: score, awayGoals: score }).nullable(),
  statusTypeId: integer.nullable(),
  nonPlayReason: z
    .enum([
      "None",
      "HomeTeamNoShow",
      "AwayTeamNoShow",
      "HomeTeamWalkover",
      "AwayTeamWalkover",
      "MatchPostponed",
      "MatchCancelled",
      "BothTeamsNoShow",
    ])
    .nullish(),
});
const responseSchema = z.object({
  tournamentId: integer.positive(),
  matches: z.array(matchSchema),
});

function clock(value: number) {
  if (value % 100 > 59) throw new MatchSyncError();
  return `${String(Math.floor(value / 100)).padStart(2, "0")}:${String(value % 100).padStart(2, "0")}`;
}

export function normalizeMatches(
  input: unknown,
  config: MatchConfig,
  teamNames: ReadonlyMap<number, string> = new Map(),
) {
  const parsed = responseSchema.parse(input);
  if (
    parsed.tournamentId !== config.tournamentId ||
    new Set(parsed.matches.map((m) => m.matchId)).size !== parsed.matches.length
  )
    throw new MatchSyncError();
  return parsed.matches
    .filter((m) => m.hometeamId === config.teamId || m.awayteamId === config.teamId)
    .map((m) => {
      if (
        m.tournamentId !== config.tournamentId ||
        m.seasonId !== config.seasonId ||
        m.hometeamId === m.awayteamId
      )
        throw new MatchSyncError();
      const home = m.hometeamId === config.teamId;
      const homeName =
        teamNames.get(m.hometeamId) ??
        volleyballTeamName(m.hometeamOverriddenName || m.hometeam, m.hometeamId);
      const awayName =
        teamNames.get(m.awayteamId) ??
        volleyballTeamName(m.awayteamOverriddenName || m.awayteam, m.awayteamId);
      const date =
        m.matchDate && !m.matchDate.startsWith("0001-") ? m.matchDate.slice(0, 10) : null;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new MatchSyncError();
      const unknownTime = !date || m.matchStartTime === 0;
      const startsAt = date ? toUTC(`${date}T${clock(m.matchStartTime)}`) : null;
      const endDate =
        date && m.matchEndTime < m.matchStartTime
          ? format(addDays(new Date(`${date}T12:00:00`), 1), "yyyy-MM-dd")
          : date;
      const endsAt =
        endDate && !unknownTime && m.matchEndTime && m.matchEndTime !== m.matchStartTime
          ? toUTC(`${endDate}T${clock(m.matchEndTime)}`)
          : null;
      const hidden = m.statusTypeId !== null && (m.statusTypeId < 1 || m.statusTypeId > 5);
      const status = hidden
        ? "unavailable"
        : m.nonPlayReason === "MatchCancelled"
          ? "cancelled"
          : m.nonPlayReason === "MatchPostponed"
            ? "postponed"
            : "scheduled";
      const result = m.matchResult;
      const hasResult =
        result?.homeGoals != null &&
        result.awayGoals != null &&
        (result.homeGoals !== 0 || result.awayGoals !== 0);
      return {
        external_event_id: String(m.matchId),
        title: home ? `${homeName} – ${awayName}` : `${awayName} – ${homeName}`,
        opponent: home ? awayName : homeName,
        home_away: "neutral" as const,
        starts_at: startsAt,
        ends_at: endsAt,
        location: m.activityAreaName || null,
        time_unknown: unknownTime,
        status,
        team_sets: hasResult ? (home ? result.homeGoals : result.awayGoals) : null,
        opponent_sets: hasResult ? (home ? result.awayGoals : result.homeGoals) : null,
      };
    });
}
export type ImportedMatch = ReturnType<typeof normalizeMatches>[number];

export async function fetchMatches(config: MatchConfig) {
  try {
    const tournament = tournamentSchema
      .extend({ areMatchesPublished: z.boolean(), isResultPublished: z.boolean() })
      .parse(await readTournamentApi(config, "Tournament"));
    if (
      tournament.isDeleted ||
      tournament.tournamentId !== config.tournamentId ||
      tournament.seasonId !== config.seasonId ||
      !tournament.areMatchesPublished
    )
      throw new MatchSyncError();
    const payload = await readTournamentApi(config, "TournamentMatches/");
    const teamNames = new Map<number, string>();
    if (tournament.isTablePublished) {
      const standings = z
        .array(
          z.object({
            orgId: integer.positive().nullish(),
            orgName: z.string().trim().min(1),
          }),
        )
        .parse(await readTournamentApi(config, "TournamentStandings/"));
      for (const team of standings) {
        if (team.orgId) teamNames.set(team.orgId, volleyballTeamName(team.orgName, team.orgId));
      }
    }
    const matches = normalizeMatches(payload, config, teamNames);
    return matches.map((m) =>
      tournament.isResultPublished ? m : { ...m, team_sets: null, opponent_sets: null },
    );
  } catch {
    throw new MatchSyncError();
  }
}
