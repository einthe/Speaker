import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, email = "user@demo.test") {
  await page.goto("/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord").fill("DemoVolleyball123!");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.waitForURL(email === "disabled@demo.test" ? /error=access/ : /\/matches$/);
}
async function openPanel(page: Page, name: "Lag" | "Kamper") {
  const toggle = page.getByRole("button", { name, exact: true });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}
async function closePanel(page: Page, name: "Lag" | "Kamper") {
  const toggle = page.getByRole("button", { name, exact: true });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "true")
    await toggle.click();
}

test("requires login and blocks disabled accounts", async ({ page }) => {
  await page.goto("/matches");
  await expect(page).toHaveURL(/\/login/);
  await login(page, "disabled@demo.test");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Kontoen din har ikke tilgang.",
  );
});

test("reads the whole script and changes both lineups locally", async ({ page }, testInfo) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "NTNUI – Fjordvik VBK", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#award")).toHaveText(/Gratulerer!/);
  const lineups = page.locator(".script section[id^='lineup-']");
  await expect(page.locator(".script").getByRole("heading")).toHaveCount(0);
  await expect(lineups.nth(0)).toContainText("Fjordvik VBK starter med følgende spillere");
  await expect(lineups.nth(1)).toContainText("På NTNUI starter spiller nummer");
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.method() !== "HEAD") writes.push(request.url());
  });
  await openPanel(page, "Lag");
  const ntnui = page.getByRole("region", { name: "Spillere NTNUI", exact: true });
  const away = page.getByRole("region", { name: "Spillere Fjordvik VBK", exact: true });
  await ntnui.getByRole("checkbox", { name: "Starter Alex Berg", exact: true }).uncheck();
  await ntnui.getByRole("checkbox", { name: "Starter Emil Strand", exact: true }).check();
  await ntnui.getByRole("button", { name: "Kaptein Emil Strand", exact: true }).click();
  await ntnui.getByLabel("Navn spiller 8", { exact: true }).fill("Endret Spiller");
  await ntnui.getByRole("button", { name: "Libero Luca Haugen", exact: true }).click();
  await away.getByRole("button", { name: "Kaptein Kim Moen", exact: true }).click();
  await expect(lineups.nth(1)).toContainText("8 Endret Spiller");
  await expect(lineups.nth(1)).not.toContainText("Alex Berg");
  await expect(lineups.nth(1)).toContainText("9 Luca Haugen");
  await expect(page.locator("#introductions")).toContainText("nummer 8, Endret Spiller");
  await expect(page.locator("#introductions")).toContainText("nummer 3, Kim Moen");
  await page
    .getByRole("combobox", { name: "Banens beste", exact: true })
    .selectOption({ label: "8 · Endret Spiller" });
  await expect(page.locator("#award")).toContainText("nummer 8 på NTNUI, Endret Spiller");
  await closePanel(page, "Lag");
  await page.getByRole("button", { name: "Større tekst" }).click();
  await expect(page.locator("#welcome p")).toHaveCSS("font-size", "24px");
  await openPanel(page, "Kamper");
  await page.getByRole("button", { name: /Nordstrand Volley/ }).click();
  await openPanel(page, "Kamper");
  await page.getByRole("button", { name: /Fjordvik VBK/ }).click();
  await expect(page.locator("#introductions")).toContainText("Endret Spiller");
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
  await page.locator("#award").scrollIntoViewIfNeeded();
  await expect(page.locator("#award")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#introductions")).not.toContainText("Endret Spiller");
  await expect(page.locator("#introductions")).toContainText("Robin Dahl");
});

test("adds a manual match and edits its players without saving", async ({ page }) => {
  await login(page, "admin@demo.test");
  await openPanel(page, "Kamper");
  await page.getByRole("button", { name: "Ny kamp", exact: true }).click();
  await page.getByLabel("Motstander", { exact: true }).fill("Tromsø");
  await page.getByLabel("Hall", { exact: true }).fill("Testhallen");
  await page.getByLabel("Førstedommer", { exact: true }).fill("Dommer Test");
  const away = page.getByRole("region", { name: "Spillere Tromsø", exact: true });
  await away.getByRole("button", { name: "Spiller", exact: true }).click();
  await away.getByLabel("Nummer spiller", { exact: true }).fill("12");
  await away.getByLabel("Navn spiller 12", { exact: true }).fill("Ny Spiller");
  await away.getByRole("checkbox", { name: "Starter Ny Spiller" }).check();
  await away.getByRole("button", { name: "Kaptein Ny Spiller" }).click();
  await expect(page.locator("#welcome")).toContainText("Testhallen");
  await expect(page.locator("#introductions")).toContainText("nummer 12, Ny Spiller");
  await expect(page.locator("#referees")).toContainText("Dommer Test");
  await away.getByRole("button", { name: "Fjern Ny Spiller" }).click();
  await expect(page.locator("#introductions")).not.toContainText("Ny Spiller");
  await closePanel(page, "Lag");
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("dark script highlights edited values and panels collapse independently", async ({
  page,
  isMobile,
}, testInfo) => {
  await login(page);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("#welcome mark")).toHaveText(["Dragvollhallen", "Fjordvik VBK"]);
  await openPanel(page, "Lag");
  await page
    .getByRole("region", { name: "Spillere NTNUI", exact: true })
    .getByLabel("Navn spiller 2", { exact: true })
    .fill("Ny Kaptein");
  await expect(page.locator("#introductions mark").filter({ hasText: "Ny Kaptein" })).toHaveCount(
    1,
  );
  await expect(page.locator("#handshake mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lag", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const withTeam = await page.getByRole("main").boundingBox();
  await closePanel(page, "Lag");
  await expect(page.locator("#team-panel")).toBeHidden();
  if (!isMobile) {
    await expect(page.locator("#match-list")).toBeVisible();
    expect((await page.getByRole("main").boundingBox())!.width).toBeGreaterThan(withTeam!.width);
  }
  await openPanel(page, "Kamper");
  await expect(page.locator("#match-list")).toBeVisible();
  await closePanel(page, "Kamper");
  await expect(page.locator("#match-list")).toBeHidden();
  await expect(page.locator("#team-panel")).toBeHidden();
  await page.locator("#award").scrollIntoViewIfNeeded();
  await expect(page.locator("#award")).toBeInViewport();
  await openPanel(page, "Kamper");
  await openPanel(page, "Lag");
  await expect(page.locator("#introductions")).toContainText("Ny Kaptein");
  if (!isMobile) await expect(page.locator("#match-list")).toBeVisible();
  await page.getByRole("main").evaluate((el) => el.scrollTo(0, 0));
  await page.locator("#team-panel").evaluate((el) => el.scrollTo(0, 0));
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dark-workspace.png"), fullPage: true });
});
