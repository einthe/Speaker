import { openNavigation } from "./support";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { palettes, paletteStorageKey } from "../../src/lib/palettes";
import { login, provision } from "./support";

test("palettes apply immediately, remain accessible and persist through reloads", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/auth/sign-in");
  const selector = page.getByRole("combobox", { name: "Fargepalett" });
  await expect(selector).toHaveValue("ntnui");
  await expect(selector.locator("option:checked")).toHaveText("Skog");
  await expect(selector.locator('option[value="petrol"]')).toHaveText("Petroleum");
  await expect(selector.locator('option[value="club"]')).toHaveText("NTNUI – Klassisk");
  for (const [palette, values] of Object.entries(palettes)) {
    await selector.selectOption(palette);
    await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      ),
    ).toBe(values.accent);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
  }
  await selector.selectOption("petrol");
  await page.reload();
  await expect(selector).toHaveValue("petrol");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "petrol");
  await page.getByRole("link", { name: "Opprett konto", exact: true }).click();
  await expect(page.getByLabel("Fullt navn")).toBeVisible();
  await expect(selector).toHaveValue("petrol");
  await page.screenshot({
    path: `test-results/petrol-auth-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("invalid or unavailable storage does not prevent changing a palette", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "unknown");
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage disabled", "SecurityError");
    };
  }, paletteStorageKey);
  await page.goto("/auth/sign-in");
  const selector = page.getByRole("combobox", { name: "Fargepalett" });
  await expect(selector).toHaveValue("ntnui");
  await selector.selectOption("petrol");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "petrol");
  await expect(selector).toHaveValue("petrol");
});

test("account palette changes preserve private navigation and synchronize between tabs", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    "Requires disposable backend.",
  );
  const player = await provision("player");
  await login(page, player);
  await expect(page.locator(".team-count")).toHaveCount(1);
  const other = await context.newPage();
  await other.goto("/roster");
  await expect(other.getByRole("heading", { name: "Tropp", exact: true })).toBeVisible();
  await page.locator(".account-summary").click();
  const selector = page.getByRole("combobox", { name: "Fargepalett" });
  await selector.selectOption("petrol");
  await expect(other.locator("html")).toHaveAttribute("data-palette", "petrol");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.locator(".account-summary").click();
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Tropp", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: player.name, exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "petrol");
  await page.screenshot({
    path: `test-results/petrol-roster-${testInfo.project.name}.png`,
    fullPage: true,
  });
  for (const palette of [
    "club",
    "club-black",
    "club-green",
    "club-forest",
    "club-charcoal",
    "club-slate",
    "amber",
    "burgundy",
    "graphite",
    "midnight",
    "plum",
  ]) {
    await page.locator(".account-summary").click();
    await selector.selectOption(palette);
    await page.locator(".account-summary").click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    if (palette === "club")
      await page.screenshot({
        path: `test-results/ntnui-roster-${testInfo.project.name}.png`,
        fullPage: true,
      });
  }
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(other).toHaveURL(/\/auth\/sign-in$/);
  await expect(page.getByRole("combobox", { name: "Fargepalett" })).toHaveValue("plum");
});
