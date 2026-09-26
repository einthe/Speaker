import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchMatches, matchConfig, MatchSyncError } from "./matches";

export function matchSyncEnabled() {
  return (
    process.env.VOLLEYBALL_MATCH_SYNC_ENABLED !== "0" && Boolean(process.env.SUPABASE_SECRET_KEY)
  );
}

export async function syncVolleyballMatches() {
  if (!matchSyncEnabled()) return { status: "disabled" as const };
  const config = matchConfig();
  const key = `${config.seasonId}:${config.tournamentId}:${config.teamId}`;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) }),
    },
  });
  const { data: lease, error } = await db.rpc("claim_volleyball_sync", { data: { sync_key: key } });
  if (error) throw new MatchSyncError();
  if (!lease) return { status: "current" as const };
  try {
    const matches = await fetchMatches(config);
    const result = await db.rpc("finish_volleyball_sync", {
      data: {
        sync_key: key,
        lease_id: lease,
        matches,
        source_url: `https://kamper.volleyball.no/schedule?seasonId=${config.seasonId}&tournamentId=${config.tournamentId}`,
      },
    });
    if (result.error) throw new MatchSyncError();
    return { status: "updated" as const, count: result.data as number };
  } catch {
    await Promise.resolve(
      db.rpc("finish_volleyball_sync", { data: { sync_key: key, lease_id: lease, failed: true } }),
    ).catch(() => {});
    throw new MatchSyncError();
  }
}

export async function refreshMatchesIfDue() {
  try {
    await syncVolleyballMatches();
  } catch {
    console.warn("VolleyballLive match sync failed; keeping existing matches.");
  }
}
