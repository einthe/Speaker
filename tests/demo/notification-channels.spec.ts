import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPassword } from "../../scripts/demo-seed.mjs";
async function login(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
}
test("admin independently controls email/in-app notifications, and demo captures safe email previews", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await login(page, "admin@demo.test");
  await page.goto("/admin/notifications");
  const card = page.getByRole("region", { name: "Innlegg", exact: true });
  const row = page
    .locator(".notification-rule")
    .filter({ has: page.locator('input[name="trigger_key"][value="post_by_coach"]') });
  const app = row.getByRole("switch", { name: "Innlegg fra trener – I appen", exact: true });
  const email = row.getByRole("switch", { name: "Innlegg fra trener – E-post", exact: true });
  await expect(card.getByRole("button", { name: "Lagre endringer", exact: true })).toHaveCount(1);
  const normal = card.getByRole("switch", { name: "Nye innlegg – I appen", exact: true });
  const originalNormal = await normal.isChecked();
  await normal.setChecked(!originalNormal);
  const personal = page.getByRole("region", { name: "Personlige varsler", exact: true });
  const personalToggle = personal.getByRole("switch").first();
  const originalPersonal = await personalToggle.isChecked();
  await personalToggle.setChecked(!originalPersonal);
  await app.uncheck();
  await email.check();
  await card.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("lagret");
  await expect(personalToggle).toBeChecked({ checked: !originalPersonal });
  // A settings refetch after saving this card must preserve edits in another card.
  await expect(normal).toBeChecked({ checked: !originalNormal });
  await page.reload();
  await expect(personalToggle).toBeChecked({ checked: originalPersonal });
  await expect(normal).toBeChecked({ checked: !originalNormal });
  await expect(app).not.toBeChecked();
  await expect(email).toBeChecked();
  await expect(
    page.getByText("Lokal demo: e-poster forhåndsvises her og sendes ikke."),
  ).toBeVisible();
  const simulator = page.getByRole("region", { name: "Test e-postvarsel", exact: true });
  await simulator.getByRole("button", { name: "Ny test", exact: true }).click();
  await simulator.getByRole("combobox", { name: "Mottaker", exact: true }).selectOption({
    label: "Andrea Berg (demo) · admin@demo.test",
  });
  await simulator
    .getByRole("combobox", { name: "Varseltype", exact: true })
    .selectOption("event_comment_created");
  await expect(simulator.getByLabel("Forhåndsvisning av testvarsel")).toContainText(
    "Ny kommentar: Lagkveld",
  );
  await simulator
    .getByRole("combobox", { name: "Varseltype", exact: true })
    .selectOption("fine_received");
  await expect(simulator.getByLabel("Forhåndsvisning av testvarsel")).toContainText(
    "For sent til trening · 50 kr",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await simulator.screenshot({ path: info.outputPath("test-email-form.png") });
  await simulator.getByRole("button", { name: "Forhåndsvis test", exact: true }).click();
  // Both viewport projects share the same demo admin and its send cooldown.
  await expect(simulator.locator('[role="status"], [role="alert"]')).toBeVisible();
  if (await simulator.getByRole("alert").isVisible()) {
    await page.waitForTimeout(10000);
    await simulator.getByRole("button", { name: "Forhåndsvis test", exact: true }).click();
  }
  await expect(simulator.getByRole("status")).toContainText("Ingen e-post sendes");
  const delivery = page.getByRole("region", { name: "E-postlevering", exact: true });
  await expect(async () => {
    await page.reload();
    await delivery.getByText("Siste e-postvarsler", { exact: true }).click();
    const item = delivery.locator("article").filter({ hasText: "[TEST] Du har fått en bot" });
    await expect(item.first()).toContainText("Forhåndsvist");
  }).toPass({ timeout: 20000 });
  await page.locator(".notification-menu > summary").click();
  await expect(page.locator(".notification-item").filter({ hasText: "[TEST]" })).toHaveCount(0);
  await page.locator(".notification-menu > summary").click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("notification-settings.png"), fullPage: true });
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
  try {
    const coach = await context.newPage();
    await login(coach, "coach@demo.test");
    const title = `E-postvarsel ${info.project.name}`;
    await coach.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
    await coach.getByLabel("Tittel", { exact: true }).fill(title);
    await coach
      .getByLabel("Innlegg", { exact: true })
      .fill("Test av lokal forhåndsvisning uten sending.");
    await coach.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
    await expect(coach.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(async () => {
      await page.reload();
      await page.getByText("Siste e-postvarsler", { exact: true }).click();
      await expect(
        page.locator(".notification-delivery article").filter({ hasText: title }).first(),
      ).toBeVisible();
      await expect(
        page.locator(".notification-delivery article").filter({ hasText: title }).first(),
      ).toContainText("Forhåndsvist");
    }).toPass({ timeout: 20000 });
    await page.locator(".notification-menu > summary").click();
    await expect(page.locator(".notification-item").filter({ hasText: title })).toHaveCount(0);
    await page.locator(".notification-menu > summary").click();
    await normal.setChecked(originalNormal);
    await app.check();
    await email.uncheck();
    await card.getByRole("button", { name: "Lagre endringer", exact: true }).click();
    await expect(card.getByRole("status")).toContainText("lagret");
    await coach.goto("/admin/notifications");
    await expect(coach).not.toHaveURL(/\/admin\/notifications$/);
  } finally {
    await context.close();
  }
});
