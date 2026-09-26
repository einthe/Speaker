import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("private pages redirect anonymous visitors and do not reveal team data", async ({ page }) => {
  for (const route of [
    "/feed",
    "/schedule",
    "/standings",
    "/roster",
    "/volunteer_work_points",
    "/admin/users",
    "/admin/notifications",
    "/posts/new",
    "/schedule/new",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.getByRole("heading", { name: "Logg inn" })).toBeVisible();
  }
});
test("registration and password recovery are reachable and accessible", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.getByRole("link", { name: "Opprett konto" }).click();
  await expect(page.getByLabel("Fullt navn")).toBeVisible();
  await expect(page.getByLabel("Passord", { exact: true })).toHaveAttribute("minlength", "12");
  await expect(page.getByLabel("Draktnummer")).toBeVisible();
  await page.getByRole("combobox", { name: "Rolle", exact: true }).selectOption("coach");
  await expect(page.getByLabel("Draktnummer")).toHaveCount(0);
  await page.getByRole("link", { name: "Logg inn", exact: true }).click();
  await page.getByRole("link", { name: "Glemt passord?" }).click();
  await expect(page.getByRole("button", { name: "Send lenke" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
test("sign-in is responsive and keyboard accessible", async ({ page }, testInfo) => {
  await page.goto("/auth/sign-in");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel("E-postadresse").fill("member@example.test");
  await page.getByLabel("Passord", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Logg inn", exact: true })).toBeFocused();
  await page.screenshot({
    path: `test-results/sign-in-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("private image route denies anonymous requests", async ({ request }) => {
  const response = await request.get("/media/00000000-0000-4000-a000-000000000001");
  expect(response.status()).toBe(403);
});
