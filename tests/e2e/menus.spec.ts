import { test, expect } from "@playwright/test";
import { login, provision } from "./support";

test("account and notification menus dismiss outside, on Escape and after navigation", async ({
  page,
}) => {
  test.skip(!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, "Requires a disposable backend");
  const player = await provision("player");
  await login(page, player);
  const account = page.locator(".account-menu");
  const notifications = page.locator(".notification-menu");
  const accountToggle = account.locator("summary");
  const notificationToggle = notifications.locator("summary");
  const heading = page.getByRole("heading", { name: "Innlegg", exact: true });

  await accountToggle.click();
  await expect(account).toHaveAttribute("open", "");
  await page.getByRole("combobox", { name: "Fargepalett" }).selectOption("petrol");
  await expect(account).toHaveAttribute("open", "");
  await heading.click();
  await expect(account).not.toHaveAttribute("open");

  await notificationToggle.click();
  await expect(notifications).toHaveAttribute("open", "");
  await notifications.locator(".dropdown-heading").click();
  await expect(notifications).toHaveAttribute("open", "");
  await heading.click();
  await expect(notifications).not.toHaveAttribute("open");

  await accountToggle.click();
  await notificationToggle.click();
  await expect(account).not.toHaveAttribute("open");
  await expect(notifications).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(notifications).not.toHaveAttribute("open");

  await accountToggle.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "Fargepalett" }).focus();
  await page.keyboard.press("Escape");
  await expect(account).not.toHaveAttribute("open");
  await expect(accountToggle).toBeFocused();

  await accountToggle.click();
  await notificationToggle.focus();
  await expect(account).not.toHaveAttribute("open");
  await accountToggle.click();
  await page.getByRole("link", { name: "Min profil", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(account).not.toHaveAttribute("open");
  await expect(page.locator(".sidebar-bottom:visible")).toHaveCount(0);
});
