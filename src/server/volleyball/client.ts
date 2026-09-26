import "server-only";
import { accessToken, forgetToken } from "@/server/standings/auth";
import { StandingsError, type StandingsConfig } from "@/server/standings/config";

export async function readTournamentApi(config: StandingsConfig, path: string): Promise<unknown> {
  const base =
    config.source === "nif"
      ? "https://data.nif.no/api/v1/ta/"
      : "https://sf48-terminlister-prod-app.azurewebsites.net/ta/";
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = config.source === "nif" ? await accessToken() : undefined;
    const response = await fetch(`${base}${path}?tournamentId=${config.tournamentId}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (response.status === 401 && token) {
      forgetToken(token);
      if (attempt === 0) continue;
    }
    if (!response.ok) throw new StandingsError();
    return response.json();
  }
  throw new StandingsError();
}
