import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login, provision } from "./support";

test("match import rejects unauthenticated job requests", async ({ request }) => {
  expect((await request.get("/api/cron/volleyball")).status()).toBe(401);
  expect(
    (
      await request.post("/api/cron/volleyball", { headers: { Authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
});

test("imported matches appear in schedule and lineup selection, retain IDs and show unknown times", async ({
  page,
}) => {
  test.skip(!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, "Requires a disposable backend");
  const account = await provision("coach");
  const syncKey = randomUUID();
  const source = "https://kamper.volleyball.no/schedule?seasonId=201070&tournamentId=449623";
  const first = {
    external_event_id: randomUUID(),
    title: `NTNUI D2A – NTNUI D2B ${syncKey.slice(0, 6)}`,
    opponent: "NTNUI D2B",
    home_away: "home",
    starts_at: "2037-10-10T09:00:00.000Z",
    ends_at: "2037-10-10T11:00:00.000Z",
    location: "Rosenborghallen A",
    status: "scheduled",
    time_unknown: false,
    team_sets: null,
    opponent_sets: null,
  };
  const second = {
    ...first,
    external_event_id: randomUUID(),
    title: `NTNUI D2C – NTNUI D2A ${syncKey.slice(0, 6)}`,
    opponent: "NTNUI D2C",
    home_away: "away",
    starts_at: null,
    ends_at: null,
    time_unknown: true,
  };
  async function importMatches(rows: unknown[]) {
    const claim = await account.service.rpc("claim_volleyball_sync", {
      data: { sync_key: syncKey },
    });
    if (claim.error) throw claim.error;
    const finish = await account.service.rpc("finish_volleyball_sync", {
      data: { sync_key: syncKey, lease_id: claim.data, source_url: source, matches: rows },
    });
    if (finish.error) throw finish.error;
  }
  await importMatches([first, second]);
  await login(page, account);
  let scheduleReads = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/team/events" && url.searchParams.get("kind") === "match")
      scheduleReads++;
  });
  await page.clock.install();
  await page.goto("/schedule?type=match");
  const known = page.locator(".event-card").filter({ hasText: first.title });
  await expect(known).toContainText("11:00–13:00");
  await expect(page.locator(".event-card").filter({ hasText: second.title })).toContainText(
    "Tidspunkt ikke fastsatt",
  );
  await expect(known).not.toContainText(/Hjemmekamp|Bortekamp|Nøytral bane/);
  expect(scheduleReads).toBe(1);
  const refresh = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/team/events" && url.searchParams.get("kind") === "match";
  });
  await page.clock.fastForward(5 * 60_000 + 1);
  await refresh;
  expect(scheduleReads).toBe(2);
  await expect(known).toBeVisible();
  await known.click();
  await expect(page).toHaveURL(/\/schedule\/[0-9a-f-]+$/);
  const url = page.url();
  await expect(page.getByRole("heading", { name: first.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rediger hendelse" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Slett hendelse" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "VolleyballLive", exact: true })).toHaveAttribute(
    "href",
    source,
  );
  await page.getByRole("link", { name: "Lag kampoppstilling" }).click();
  await page.getByRole("button", { name: "Lagre utkast" }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("link", { name: "Fortsett utkast" })).toBeVisible();
  await expect(page.locator(".event-detail")).not.toContainText(
    /Hjemmekamp|Bortekamp|Nøytral bane/,
  );
  await page.getByRole("link", { name: "Rediger tittel" }).click();
  const customTitle = `NTNUI D2B – NTNUI D2A ${syncKey.slice(0, 6)} (endret)`;
  await page.getByLabel("Tittel", { exact: true }).fill(customTitle);
  await page.getByRole("button", { name: "Lagre endringer" }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: customTitle, exact: true })).toBeVisible();
  const due = await account.service
    .from("volleyball_sync_state")
    .update({ next_attempt_at: "2000-01-01T00:00:00Z" })
    .eq("sync_key", syncKey);
  if (due.error) throw due.error;
  await importMatches([{ ...first, location: "Ny hall", team_sets: 3, opponent_sets: 1 }, second]);
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByText("Ny hall", { exact: true })).toBeVisible();
  await expect(page.locator(".score")).toHaveText("3 – 1");
  await expect(page.getByRole("link", { name: "Fortsett utkast" })).toBeVisible();
  await expect(page.getByRole("heading", { name: customTitle, exact: true })).toBeVisible();
  await page.goto("/lineups/new");
  await expect(page.locator(".event-card").filter({ hasText: customTitle })).toBeVisible();
});
