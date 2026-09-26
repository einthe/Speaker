import { test, expect } from "@playwright/test";
import { login, provision } from "./support";

test("one action clears every unread notification and remains cleared after reload", async ({
  page,
  browser,
}) => {
  const member = await provision("player");
  const coach = await provision("coach");
  const result = await coach.service
    .from("notification_rules")
    .update({ enabled: true, email_enabled: false })
    .eq("trigger_key", "post_by_coach");
  expect(result.error).toBeNull();
  const context = await browser.newContext({ viewport: page.viewportSize() });
  try {
    await login(page, coach);
    for (const n of [1, 2]) {
      await page.goto("/posts/new");
      const title = `Varsel ${n} ${coach.name}`;
      await page.getByLabel("Tittel", { exact: true }).fill(title);
      await page.getByLabel("Innlegg", { exact: true }).fill("Test av lesestatus.");
      await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    const recipient = await context.newPage();
    await login(recipient, member);
    await recipient.locator(".notification-menu > summary").click();
    const menu = recipient.locator(".notification-dropdown");
    await expect(menu.locator(".notification-item.unread")).toHaveCount(2);
    await menu.getByRole("button", { name: "Merk alle som lest", exact: true }).click();
    await expect(menu.locator(".notification-item.unread")).toHaveCount(0);
    await expect(menu.getByText("0 uleste", { exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Merk alle som lest", exact: true })).toHaveCount(
      0,
    );
    await recipient.reload();
    await recipient.locator(".notification-menu > summary").click();
    await expect(menu.locator(".notification-item.unread")).toHaveCount(0);
    await expect(menu.locator(".notification-item")).toHaveCount(2);
  } finally {
    await context.close();
    await coach.service
      .from("notification_rules")
      .update({ enabled: false })
      .eq("trigger_key", "post_by_coach");
  }
});
