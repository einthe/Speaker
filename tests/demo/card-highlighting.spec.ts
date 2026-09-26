import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPassword } from "../../scripts/demo-seed.mjs";

async function login(page: Page, email = "coach@demo.test") {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
}

async function highlighting(page: Page, value: "standard" | "full") {
  await page.locator(".account-summary").click();
  await page.getByLabel("Fremheving av innlegg og hendelser").selectOption(value);
  await page.locator(".account-summary").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-highlighting", value);
}

async function colors(page: Page, value: "soft" | "classic") {
  await page.locator(".account-summary").click();
  await page.getByLabel("Farger på innlegg og hendelser").selectOption(value);
  await page.locator(".account-summary").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-colors", value);
}

async function solidCards(page: Page) {
  const cards = page.locator(".role-post, .coach-post, .event-highlight");
  await expect(cards.first()).toBeVisible();
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const style = getComputedStyle(node);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d")!;
            context.fillStyle = style.backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
            return (
              style.backgroundImage !== "none" ||
              style.opacity !== "1" ||
              alpha !== 255 ||
              Math.max(red, green, blue) >= 128
            );
          })
          .map((node) => ({
            text: node.textContent?.slice(0, 100),
            background: getComputedStyle(node).backgroundColor,
            border: getComputedStyle(node).borderLeftColor,
          })),
      ),
    )
    .toEqual([]);
}

test("full card colors stay dark and opaque, preserve normal posts and remain readable across palettes", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await login(page, "player@demo.test");
  await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
  await page.getByLabel("Tittel").fill(`Vanlig innlegg ${info.project.name}`);
  await page.getByLabel("Innlegg", { exact: true }).fill("Et vanlig innlegg uten ansvarsfarge.");
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Vanlig innlegg ${info.project.name}`, exact: true }),
  ).toBeVisible();
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/auth\/sign-in/);
  await login(page);
  const normal = page.locator(".post-card:not(.role-post):not(.coach-post)").first();
  await expect(normal).toBeVisible();
  const normalStyle = () =>
    normal.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.backgroundImage, style.color];
    });
  const original = await normalStyle();
  await highlighting(page, "full");
  await solidCards(page);
  expect(await normalStyle()).toEqual(original);
  const role = page.locator(".role-post").first();
  const softColor = await role.evaluate((node) => getComputedStyle(node).borderLeftColor);
  await colors(page, "classic");
  expect(await normalStyle()).toEqual(original);
  await expect
    .poll(() => role.evaluate((node) => getComputedStyle(node).borderLeftColor))
    .not.toBe(softColor);
  await colors(page, "soft");
  await expect
    .poll(() => role.evaluate((node) => getComputedStyle(node).borderLeftColor))
    .toBe(softColor);

  for (const route of ["/feed", "/schedule"]) {
    await page.goto(route);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-card-highlighting", "full");
    for (const palette of [
      "club",
      "ntnui",
      "petrol",
      "midnight",
      "plum",
      "amber",
      "burgundy",
      "graphite",
    ]) {
      await page.locator(".account-summary").click();
      await page.getByLabel("Fargepalett").selectOption(palette);
      await page.locator(".account-summary").click();
      for (const [scheme, mode] of [
        ["soft", "full"],
        ["classic", "standard"],
        ["classic", "full"],
      ] as const) {
        await colors(page, scheme);
        await highlighting(page, mode);
        if (mode === "full") await solidCards(page);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        expect(result.violations, `${route}, ${palette}, ${scheme}, ${mode}`).toEqual([]);
      }
    }
    await page.screenshot({ path: info.outputPath(`${route.slice(1)}-full.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole("heading", { name: "NTNUI – Fjordvik", exact: true }).click();
  await expect(page.locator(".event-detail")).toBeVisible();
  await solidCards(page);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await highlighting(page, "standard");
  expect(
    await page.locator(".event-detail").evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toContain("linear-gradient");
});

test("highlighting persists in this browser separately for each account", async ({ page }) => {
  await login(page);
  await highlighting(page, "full");
  await colors(page, "classic");
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-highlighting", "full");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-colors", "classic");
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Høy kontrast", exact: true }).click();
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-high-contrast", "on");
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/auth\/sign-in/);
  await login(page, "player@demo.test");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-highlighting", "standard");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-colors", "soft");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-high-contrast", "off");
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/auth\/sign-in/);
  await login(page);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-highlighting", "full");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-card-colors", "classic");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-high-contrast", "on");
});
