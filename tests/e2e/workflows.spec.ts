import { test, expect } from "@playwright/test";
import { provision, login, postFields } from "./support";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";

const configured = Boolean(
  process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
);
if (process.env.E2E_REQUIRE_BACKEND === "1" && !configured)
  throw new Error("Missing integration-test backend");
test.use({ actionTimeout: 15000 });
test.skip(!configured, "Requires a disposable test backend; use npm run test:e2e:local.");

async function picture() {
  return {
    name: "trening.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 64, height: 48, channels: 3, background: "#77964a" } })
      .png()
      .toBuffer(),
  };
}

test("player can publish, revisit, edit and delete image/text posts without breaking the feed", async ({
  page,
  request,
}, testInfo) => {
  const account = await provision("player");
  await login(page, account);
  await expect(page.getByRole("link", { name: "Kampoppstilling", exact: true })).toHaveCount(0);
  await page.goto("/lineups/new");
  await expect(page).toHaveURL(/\/feed$/);
  const title = `Bilde ${randomUUID().slice(0, 8)}`;
  await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
  await postFields(page, title);
  await page.locator('input[name="image"]').setInputFiles(await picture());
  await page.getByLabel("Beskriv bildene").fill("Laget på trening");
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const postUrl = page.url();
  const image = page.getByRole("img", { name: "Laget på trening" });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const imagePath = (await image.getAttribute("data-source"))!;
  expect((await page.request.get(imagePath)).status()).toBe(200);
  expect((await request.get(imagePath)).status()).toBe(403);
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/feed-image-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.goto(postUrl);
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  await expect(page.locator('input[name="image"]')).toHaveCount(0);
  await page.getByLabel("Tittel", { exact: true }).fill(`${title} redigert`);
  await page.getByRole("button", { name: "Lagre endringer" }).click();
  await expect(page.getByRole("heading", { name: `${title} redigert`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fjern bilde", exact: true }).click();
  await page.getByRole("button", { name: "Ja, fjern bilde", exact: true }).click();
  await expect(page.locator("img.post-image")).toHaveCount(0);
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  await expect(page.locator('input[name="image"]')).toBeVisible();
  await page.goto(postUrl);
  await page.getByRole("button", { name: "Slett innlegg", exact: true }).click();
  await page.getByRole("button", { name: "Ja, slett innlegg", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole("heading", { name: `${title} redigert`, exact: true })).toHaveCount(
    0,
  );
  await page.goto("/posts/new");
  await postFields(page, `${title} uten bilde`);
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await page.goto("/feed");
  await expect(
    page.getByRole("heading", { name: `${title} uten bilde`, exact: true }),
  ).toBeVisible();
});

test("a failed upload can be retried without creating duplicate posts", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.E2E_LOCAL_ADAPTER !== "1",
    "Failure injection is only available in the isolated local adapter.",
  );
  const account = await provision("player");
  await login(page, account);
  const title = `Retry ${randomUUID().slice(0, 8)}`;
  await page.goto("/posts/new");
  await postFields(page, title);
  await page.locator('input[name="image"]').setInputFiles(await picture());
  await request.post(`${process.env.E2E_SUPABASE_URL}/__test/fail`, {
    headers: { Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_ROLE_KEY}` },
    data: { operation: "upload" },
  });
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Teksten er lagret" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Åpne det lagrede innlegget" })).toBeVisible();
  await postFields(page, title);
  await page.locator('input[name="image"]').setInputFiles(await picture());
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const { data, error } = await account.service.from("posts").select("id").eq("title", title);
  if (error) throw error;
  expect(data).toHaveLength(1);
});

test("feed failures stay contained and retry refetches content", async ({ page, request }) => {
  test.skip(
    process.env.E2E_LOCAL_ADAPTER !== "1",
    "Failure injection is only available in the isolated local adapter.",
  );
  const account = await provision("player");
  await login(page, account);
  await expect(page.locator(".team-count")).toHaveCount(1);
  for (const [operation, title] of [
    ["posts", "Innleggene kunne ikke hentes"],
    ["schedule_events", "Terminlisten kunne ikke hentes"],
  ]) {
    // Leave the feed before injecting a failure so an in-flight read cannot consume it.
    await page.goto("/posts/new");
    await expect(page.getByRole("button", { name: "Publiser innlegg" })).toBeVisible();
    await request.post(`${process.env.E2E_SUPABASE_URL}/__test/fail`, {
      headers: { Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_ROLE_KEY}` },
      data: { operation },
    });
    await page.goto("/feed");
    const fallback = page.getByRole("alert").filter({ hasText: title });
    await expect(fallback).toBeVisible();
    await expect(page.getByRole("link", { name: "Nytt innlegg", exact: true })).toBeVisible();
    await fallback.getByRole("button", { name: "Prøv igjen" }).click();
    await expect(fallback).toHaveCount(0);
  }
});

test("coach can discover lineup creation from the feed and players cannot", async ({ page }) => {
  const account = await provision("coach");
  await login(page, account);
  await page.getByRole("link", { name: "Kampoppstilling", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ny kampoppstilling", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Opprett kamp", exact: true }).first()).toBeVisible();
});

test("admin changes reach the roster, event permissions and notification inbox", async ({
  page,
  browser,
}) => {
  const admin = await provision("admin");
  const player = await provision("player");
  await login(page, admin);
  await page.goto("/admin/users");
  const member = page.locator("details.admin-user").filter({ hasText: player.email });
  await member.locator("summary").first().click();
  // Reserve an unused jersey in this disposable database, including hosted test runs.
  const { data: jerseys, error } = await admin.service
    .from("player_profiles")
    .select("jersey_number");
  if (error) throw error;
  const jersey = Array.from({ length: 100 }, (_, i) => i).find(
    (n) => !jerseys.some((p) => p.jersey_number === n),
  );
  if (jersey === undefined)
    throw new Error("Disposable test database has no unused jersey numbers.");
  await member.getByLabel("Draktnummer").fill(String(jersey));
  await member.getByLabel("Dugnadsansvarlig", { exact: true }).check();
  await member.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(member.getByRole("status")).toContainText("lagret");
  await member.getByText("Spillerposisjoner", { exact: true }).click();
  await member.locator('select[name="primary"]').selectOption("setter");
  await member.getByRole("button", { name: "Lagre posisjoner" }).click();
  await expect(member.locator(".position-editor").getByRole("status")).toContainText("lagret");
  await page.goto("/admin/notifications");
  const rule = page
    .locator(".notification-rules-form")
    .filter({ has: page.getByRole("switch", { name: "Nye innlegg – I appen", exact: true }) });
  await rule.getByRole("switch", { name: "Nye innlegg – I appen", exact: true }).check();
  await rule.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(rule.getByRole("status")).toContainText("lagret");
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  try {
    const memberPage = await context.newPage();
    await login(memberPage, player);
    await memberPage.goto("/roster");
    const card = memberPage
      .locator("article.player-card")
      .filter({ has: memberPage.getByRole("heading", { name: player.name, exact: true }) });
    await expect(card.locator(".player-position")).toContainText("Legger");
    await expect(card.locator(".jersey-number")).toContainText(String(jersey).padStart(2, "0"));
    await expect(card.getByText("Dugnadsansvarlig", { exact: true })).toBeVisible();
    await memberPage.goto("/schedule/new");
    await expect(memberPage.locator('select[name="event_type"] option')).toHaveText(["Dugnad"]);
    const eventTitle = `Dugnad ${randomUUID().slice(0, 8)}`;
    await memberPage.getByLabel("Tittel", { exact: true }).fill(eventTitle);
    await memberPage.getByLabel("Starter", { exact: true }).fill("2027-01-20T18:00");
    await memberPage.getByLabel(player.name, { exact: true }).check();
    await memberPage.getByRole("button", { name: "Opprett hendelse" }).click();
    await expect(memberPage.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
    await expect(memberPage.locator(".assignments")).toContainText(player.name);
    await page.goto("/posts/new");
    const title = `Varsel ${randomUUID().slice(0, 8)}`;
    await postFields(page, title);
    await page.getByRole("button", { name: "Publiser innlegg" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await memberPage.goto("/feed");
    await memberPage.locator(".notification-menu > summary").click();
    const notification = memberPage.locator(".notification-item").filter({ hasText: title });
    await expect(notification).toBeVisible();
    await notification.getByRole("button", { name: "Merk som lest" }).click();
    await expect(notification.getByRole("button", { name: "Merk som lest" })).toHaveCount(0);
    await page.goto("/admin/users");
    await member.locator("summary").first().click();
    await member.locator('select[name="account_status"]').selectOption("disabled");
    await member.getByRole("button", { name: "Lagre endringer", exact: true }).click();
    await expect(member.getByRole("status")).toContainText("lagret");
    await memberPage.goto("/feed");
    await expect(memberPage).toHaveURL(/\/auth\/rejected$/);
  } finally {
    await context.close();
    await page.goto("/admin/notifications");
    await rule.getByRole("switch", { name: "Nye innlegg – I appen", exact: true }).uncheck();
    await rule.getByRole("button", { name: "Lagre endringer", exact: true }).click();
    await expect(rule.getByRole("status")).toContainText("lagret");
  }
});
