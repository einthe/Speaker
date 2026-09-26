import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPassword } from "../../scripts/demo-seed.mjs";

test("mobile drawer preserves desktop navigation and supports focus, dismissal and resizing", async ({
  page,
}, info) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill("admin@demo.test");
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
  const toggle = page.locator(".mobile-menu-toggle");
  const drawer = page.getByRole("dialog", { name: "Navigasjon" });
  if (info.project.name === "desktop") {
    await expect(toggle).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Hovedmeny" })).toBeVisible();
    await expect(drawer).toBeHidden();
    return;
  }
  await expect(page.getByRole("navigation", { name: "Hovedmeny" })).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await page.locator(".topbar").boundingBox())!.y).toBe(0);
  await page.screenshot({ path: info.outputPath("mobile-topbar.png") });
  await toggle.click();
  await expect(drawer).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Lukk meny" })).toBeFocused();
  await expect(drawer.getByRole("link", { name: "Administrasjon", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await toggle.click();
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width - 8, viewport.height / 2);
  await expect(drawer).toBeHidden();
  await toggle.click();
  await drawer.getByRole("link", { name: "Tropp", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tropp", exact: true })).toBeVisible();
  await expect(drawer).toBeHidden();
  await toggle.click();
  await drawer.getByRole("link", { name: "Kamper", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule\?type=match$/);
  await expect(drawer).toBeHidden();
  await toggle.click();
  // Selecting the current route also dismisses the drawer.
  await drawer.getByRole("link", { name: "Kamper", exact: true }).click();
  await expect(drawer).toBeHidden();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  expect(await drawer.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("mobile-drawer.png") });
  await page.setViewportSize({ width: 740, height: 360 });
  await drawer.getByRole("link", { name: "Administrasjon", exact: true }).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole("link", { name: "Administrasjon", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toBeHidden();
  await expect(page.locator(".desktop-sidebar")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.getByRole("button", { name: "Lukk meny" }).click();
  await expect(toggle).toBeFocused();
});
