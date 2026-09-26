import "server-only";
import { z } from "zod";

export class StandingsError extends Error {
  constructor() {
    super("Tabellen kunne ikke hentes. Prøv igjen senere.");
  }
}

const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export function standingsConfig() {
  const config = z.object({ seasonId: id, tournamentId: id }).safeParse({
    seasonId: process.env.VOLLEYBALL_SEASON_ID ?? "201070",
    tournamentId: process.env.VOLLEYBALL_TOURNAMENT_ID ?? "449623",
  });
  const clientId = process.env.NIF_CLIENT_ID?.trim();
  const secret = process.env.NIF_CLIENT_SECRET?.trim();
  if (!config.success || Boolean(clientId) !== Boolean(secret)) throw new StandingsError();
  return { ...config.data, source: clientId ? ("nif" as const) : ("public" as const) };
}

export type StandingsConfig = ReturnType<typeof standingsConfig>;
