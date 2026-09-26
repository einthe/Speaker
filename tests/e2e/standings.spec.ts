import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, openNavigation, provision } from "./support";
import type { Standings } from "@/lib/standings";

const data: Standings = {
  tournament: "Trøndelag – 2. divisjon",
  season: "2026/2027",
  published: true,
  fetchedAt: "2026-09-20T12:00:00Z",
  sourceUrl: "https://kamper.volleyball.no/standings?seasonId=201070&tournamentId=449623",
  rows: [
    {
      id: 1,
      rank: 1,
      team: "NTNUI",
      played: 3,
      wins: 2,
      losses: 1,
      points: 6,
      setsWon: 7,
      setsLost: 3,
      setDifference: 4,
      rallyPointsWon: 241,
      rallyPointsLost: 220,
      rallyPointDifference: 21,
    },
    {
      id: 2,
      rank: null,
      team: "Eksempellag",
      played: 0,
      wins: null,
      losses: null,
      points: null,
      setsWon: null,
      setsLost: null,
      setDifference: null,
      rallyPointsWon: null,
      rallyPointsLost: null,
      rallyPointDifference: null,
    },
  ],
};
test("standings API denies anonymous access", async ({ request }) => {
  const response = await request.get("/api/team/standings");
  expect(response.status()).toBe(401);
  expect(await response.text()).not.toContain("rows");
});

test.describe("private standings", () => {
  test.skip(!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, "Needs a disposable test backend");

  test("navigation, table, source and horizontal scrolling work on desktop and mobile", async ({
    page,
  }, info) => {
    const user = await provision("player");
    await page.route("**/api/team/standings?*", (route) => route.fulfill({ json: { data } }));
    await login(page, user);
    await openNavigation(page);
    const nav = page.locator(".sidebar:visible, .mobile-sidebar:visible");
    const mainLinks = await nav
      .locator(
        'a[href="/feed"]:not(.brand), a[href="/schedule"], a[href="/standings"], a[href="/roster"], a[href="/volunteer_work_points"]',
      )
      .allTextContents();
    expect(mainLinks.map((label) => label.trim())).toEqual([
      "Innlegg",
      "Terminliste",
      "Tabell",
      "Tropp",
      "Dugnadspoeng",
    ]);
    await page.getByRole("link", { name: "Tabell", exact: true }).click();
    await expect(page).toHaveURL(/\/standings$/);
    await expect(page.getByRole("heading", { name: "Tabell" })).toBeVisible();
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Tabell");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("rowheader")).toHaveText(["NTNUI", "Eksempellag"]);
    await expect(page.getByRole("row").nth(2)).toContainText("–");
    await expect(page.getByRole("link", { name: "VolleyballLive" })).toHaveAttribute(
      "href",
      data.sourceUrl,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const scroller = page.getByRole("region", { name: "Ligatabell" });
    if (info.project.name === "mobile") {
      await scroller.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }
    await page.screenshot({
      path: `test-results/standings-${info.project.name}.png`,
      fullPage: true,
    });
    const rejected = await page.request.get("/api/team/standings", {
      headers: { "X-Team-Scope": "wrong-scope" },
    });
    expect(rejected.status()).toBe(409);
  });

  test("empty, unavailable and retry states use the existing page patterns", async ({ page }) => {
    const user = await provision("coach");
    let unavailable = true;
    await page.route("**/api/team/standings?*", (route) =>
      route.fulfill(
        unavailable
          ? { status: 503, json: { error: "Tabellen kunne ikke hentes." } }
          : { json: { data: { ...data, rows: [] } } },
      ),
    );
    await login(page, user);
    await page.goto("/standings");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Tabellen kunne ikke hentes",
    );
    unavailable = false;
    await page.getByRole("button", { name: "Prøv igjen" }).click();
    await expect(page.getByRole("heading", { name: "Ingen tabell ennå" })).toBeVisible();
    await expect(page.getByRole("link", { name: "VolleyballLive" })).toBeVisible();
  });

  test("refreshes every five minutes and preserves visible standings during a failed refresh", async ({
    page,
  }) => {
    const user = await provision("player");
    let calls = 0;
    await page.route("**/api/team/standings?*", (route) => {
      calls++;
      return route.fulfill(
        calls === 2
          ? { status: 503, json: { error: "Unavailable" } }
          : {
              json: {
                data: { ...data, tournament: calls > 2 ? "Oppdatert serie" : data.tournament },
              },
            },
      );
    });
    await login(page, user);
    await page.clock.install();
    await page.goto("/standings");
    await expect(page.getByRole("table")).toBeVisible();
    await page.clock.fastForward(5 * 60_000 + 1);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Viser sist hentede innhold",
    );
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "Prøv igjen" }).click();
    await expect(
      page.locator(".page-heading").getByText("Oppdatert serie", { exact: true }),
    ).toBeVisible();
  });
});
