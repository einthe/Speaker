import "server-only";
import { z } from "zod";
import type { Standing } from "@/lib/standings";
import { StandingsError } from "./config";
import { volleyballTeamName } from "@/lib/volleyball-teams";

const integer = z.number().int().safe();
const optionalStat = integer.nullish().transform((value) => value ?? null);
export const tournamentSchema = z.object({
  tournamentId: integer.positive(),
  seasonId: integer.positive(),
  tournamentName: z.string().trim().min(1),
  seasonName: z.string().nullish(),
  isTablePublished: z.boolean(),
  isDeleted: z.boolean(),
  sportId: z.literal(157),
});
const rowsSchema = z.array(
  z.object({
    entryId: integer.positive(),
    position: integer.positive().nullish(),
    orgName: z.string().trim().min(1),
    orgId: integer.positive().nullish(),
    matches: optionalStat,
    victories: optionalStat,
    losses: optionalStat,
    totalPoints: optionalStat,
    goalsScored: optionalStat,
    goalsConceeded: optionalStat,
    goalDifference: optionalStat,
    partialPointsScored: optionalStat,
    partialPointsConceded: optionalStat,
    partialPointsDifference: optionalStat,
  }),
);

export function normalizeRows(input: unknown): Standing[] {
  const parsed = rowsSchema.safeParse(input);
  if (!parsed.success || new Set(parsed.data.map((row) => row.entryId)).size !== parsed.data.length)
    throw new StandingsError();
  return parsed.data.map((row) => ({
    id: row.entryId,
    rank: row.position ?? null,
    team: volleyballTeamName(row.orgName, row.orgId),
    played: row.matches,
    wins: row.victories,
    losses: row.losses,
    points: row.totalPoints,
    // NIF's volleyball "goals" are sets; "goalsConceeded" is the upstream spelling.
    setsWon: row.goalsScored,
    setsLost: row.goalsConceeded,
    setDifference: row.goalDifference,
    rallyPointsWon: row.partialPointsScored,
    rallyPointsLost: row.partialPointsConceded,
    rallyPointDifference: row.partialPointsDifference,
  }));
}
