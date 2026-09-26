import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetchMatches: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/volleyball/matches", async (original) => ({
  ...(await original<typeof import("@/server/volleyball/matches")>()),
  fetchMatches: mocks.fetchMatches,
}));
import { syncVolleyballMatches } from "@/server/volleyball/sync";
import { GET } from "@/app/api/cron/volleyball/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret-test");
  vi.stubEnv("VOLLEYBALL_MATCH_SYNC_ENABLED", "1");
  vi.stubEnv("CRON_SECRET", "cron-secret-test");
  vi.stubEnv("NIF_CLIENT_ID", "");
  vi.stubEnv("NIF_CLIENT_SECRET", "");
  vi.stubEnv("VOLLEYBALL_SEASON_ID", "201070");
  vi.stubEnv("VOLLEYBALL_TOURNAMENT_ID", "449623");
  vi.stubEnv("VOLLEYBALL_TEAM_ID", "913845");
});
afterEach(() => vi.unstubAllEnvs());
it("does not use external services when import is disabled or credentials are missing", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect(await syncVolleyballMatches()).toEqual({ status: "disabled" });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.fetchMatches).not.toHaveBeenCalled();
});
it("does not fetch the provider again when the database lease is unavailable", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await syncVolleyballMatches()).toEqual({ status: "current" });
  expect(mocks.fetchMatches).not.toHaveBeenCalled();
});
it("only submits validated provider matches and the acquired lease for atomic persistence", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: "lease", error: null })
    .mockResolvedValueOnce({ data: 16, error: null });
  mocks.fetchMatches.mockResolvedValue([{ external_event_id: "8457476" }]);
  expect(await syncVolleyballMatches()).toEqual({ status: "updated", count: 16 });
  expect(mocks.rpc.mock.calls[1]).toEqual([
    "finish_volleyball_sync",
    {
      data: {
        sync_key: "201070:449623:913845",
        lease_id: "lease",
        matches: [{ external_event_id: "8457476" }],
        source_url: "https://kamper.volleyball.no/schedule?seasonId=201070&tournamentId=449623",
      },
    },
  ]);
});
it("records a failed attempt instead of replacing existing matches during an outage", async () => {
  mocks.rpc.mockResolvedValue({ data: "lease", error: null });
  mocks.fetchMatches.mockRejectedValue(new Error("private-token"));
  await expect(syncVolleyballMatches()).rejects.toThrow(
    "Kampene fra VolleyballLive kunne ikke oppdateres.",
  );
  expect(mocks.rpc.mock.calls[1][1]).toEqual({
    data: { sync_key: "201070:449623:913845", lease_id: "lease", failed: true },
  });
});
it("protects the scheduled job even if CRON_SECRET is absent and never trusts query parameters", async () => {
  const request = (authorization?: string) =>
    new Request("https://example.test/api/cron/volleyball?teamId=1", {
      headers: authorization ? { Authorization: authorization } : {},
    });
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request("Bearer wrong"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request("Bearer "))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns safe cron results and configuration errors without exposing secrets", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const request = new Request("https://example.test/api/cron/volleyball", {
    headers: { Authorization: "Bearer cron-secret-test" },
  });
  expect((await GET(request)).status).toBe(200);
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  const disabled = await GET(request);
  expect(disabled.status).toBe(503);
  expect(await disabled.text()).not.toContain("secret-test");
});
