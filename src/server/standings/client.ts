import "server-only";
import type { Standings } from "@/lib/standings";
import { readTournamentApi as read } from "@/server/volleyball/client";
import { StandingsError, type StandingsConfig } from "./config";
import { normalizeRows, tournamentSchema } from "./validation";

export async function fetchStandings(config: StandingsConfig): Promise<Standings> {
  try {
    const tournament = tournamentSchema.parse(await read(config, "Tournament"));
    if (
      tournament.tournamentId !== config.tournamentId ||
      tournament.seasonId !== config.seasonId ||
      tournament.isDeleted
    )
      throw new StandingsError();
    const rows = tournament.isTablePublished
      ? normalizeRows(await read(config, "TournamentStandings/"))
      : [];
    return {
      tournament: tournament.tournamentName,
      season: tournament.seasonName ?? null,
      published: tournament.isTablePublished,
      rows,
      sourceUrl: `https://kamper.volleyball.no/standings?seasonId=${config.seasonId}&tournamentId=${config.tournamentId}`,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    // Never forward token responses, upstream bodies or validation payloads to callers/logs.
    throw new StandingsError();
  }
}
