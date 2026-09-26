import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPassword } from "../../scripts/demo-seed.mjs";

async function toggle(page: Page, enabled: boolean) {
  await page.locator(".account-summary").click();
  const button = page.getByRole("button", { name: "Høy kontrast", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== String(enabled)) await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(enabled));
  await page.locator(".account-summary").click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-high-contrast",
    enabled ? "on" : "off",
  );
}

test("high contrast gives white text and darker surfaces in every palette and card style", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill("coach@demo.test");
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".post-card").first()).toBeVisible();

  for (const palette of [
    "club",
    "club-black",
    "club-green",
    "club-forest",
    "club-charcoal",
    "club-slate",
    "ntnui",
    "petrol",
    "midnight",
    "plum",
    "amber",
    "burgundy",
    "graphite",
  ]) {
    await toggle(page, false);
    await page.locator(".account-summary").click();
    await page.getByLabel("Fargepalett").selectOption(palette);
    await page.getByLabel("Farger på innlegg og hendelser").selectOption("soft");
    await page.getByLabel("Fremheving av innlegg og hendelser").selectOption("standard");
    await page.locator(".account-summary").click();
    if (palette.startsWith("club")) {
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
      ).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${palette}.png`) });
    }
    if (["club-charcoal", "club-slate"].includes(palette)) {
      for (const mode of ["standard", "full"]) {
        await page.locator(".account-summary").click();
        await page.getByLabel("Farger på innlegg og hendelser").selectOption("classic");
        await page.getByLabel("Fremheving av innlegg og hendelser").selectOption(mode);
        await page.locator(".account-summary").click();
        expect(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          `${palette}, normal contrast, classic, ${mode}`,
        ).toEqual([]);
      }
    }
    const original = await page.locator("h1").evaluate((node) => getComputedStyle(node).color);
    await toggle(page, true);
    await expect(page.locator("h1")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator(".post-body").first()).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator(".post-author > span").first()).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    const darker = await page.locator(".app-shell").evaluate((node) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const brightness = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .reduce((a, b) => a + b, 0);
      };
      const before = getComputedStyle(document.documentElement).getPropertyValue("--bg");
      return brightness(getComputedStyle(node).backgroundColor) < brightness(before);
    });
    expect(darker, palette).toBe(true);
    for (const scheme of ["soft", "classic"]) {
      for (const mode of ["standard", "full"]) {
        await page.locator(".account-summary").click();
        await page.getByLabel("Farger på innlegg og hendelser").selectOption(scheme);
        await page.getByLabel("Fremheving av innlegg og hendelser").selectOption(mode);
        await page.locator(".account-summary").click();
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        expect(result.violations, `${palette}, ${scheme}, ${mode}`).toEqual([]);
      }
    }
    await toggle(page, false);
    await expect(page.locator("h1")).toHaveCSS("color", original);
  }
  await toggle(page, true);
  await page.goto("/schedule");
  await expect(page.locator(".event-card").first()).toBeVisible();
  await expect(page.locator(".event-meta").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("high-contrast-schedule.png"), fullPage: true });
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 500 });
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Logg ut", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
