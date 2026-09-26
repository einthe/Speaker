import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { login, openNavigation, provision } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable backend.");

test("Botsjef manages fine types and fines for players/coaches; the team can read their histories", async ({
  page,
  browser,
}, testInfo) => {
  const admin = await provision("admin");
  const manager = await provision("player");
  const player = await provision("player");
  const coach = await provision("coach");
  const ruleName = `Kampdag ${randomUUID().slice(0, 6)}`;
  const fineName = `For sent ${randomUUID().slice(0, 6)}`;
  await login(page, admin);
  await page.goto("/admin/users");
  const member = page.locator("details.admin-user").filter({ hasText: manager.email });
  await member.locator("summary").first().click();
  await member.getByLabel("Botsjef", { exact: true }).check();
  await member.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(member.getByRole("status")).toContainText("lagret");
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await login(page, manager);
  await openNavigation(page);
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  const links = await nav.getByRole("link").allTextContents();
  expect(links.map((label) => label.trim()).slice(-2)).toEqual(["Dugnadspoeng", "Bøter"]);
  await nav.getByRole("link", { name: "Bøter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bøter", exact: true })).toBeVisible();
  await expect(page.locator(`[data-fine-member="${admin.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-fine-member="${manager.id}"]`)).toHaveClass(
    /standings-team-highlight/,
  );
  const tabs = page.getByRole("navigation", { name: "Bøter", exact: true });
  await tabs.getByRole("link", { name: "Bøter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Opprett bot", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ny bot", exact: true }).click();
  const create = page.locator("#new-fine-type");
  await create.getByLabel("Navn", { exact: true }).fill(fineName);
  await create.getByLabel("Beløp (kr)", { exact: true }).fill("50");
  await create.getByLabel("Beskrivelse (valgfritt)").fill("Etter avtalt starttid.");
  await create.getByRole("button", { name: "Opprett bot", exact: true }).click();
  await expect(page.locator(".fine-type-editor").filter({ hasText: fineName })).toBeVisible();
  await expect(create).toHaveCount(0);
  const extraRules = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Ekstraregler", exact: true }) });
  await expect(extraRules).not.toContainText("Vanlig");
  await page.getByRole("button", { name: "Ny ekstraregel", exact: true }).click();
  const extra = page.locator("#new-fine-multiplier");
  await extra.getByLabel("Navn", { exact: true }).fill(ruleName);
  await extra.getByLabel("Multiplikator", { exact: true }).fill("1,5");
  await extra.getByRole("button", { name: "Opprett ekstraregel", exact: true }).click();
  await expect(extra).toHaveCount(0);
  const { data: multiplier } = await admin.service
    .from("fine_multipliers")
    .select("id")
    .eq("name", ruleName)
    .single();
  const { data: type, error } = await admin.service
    .from("fine_types")
    .select("id")
    .eq("name", fineName)
    .single();
  expect(error).toBeNull();
  await expect(tabs.getByRole("link")).toHaveText(["Bøtetabell", "Bøter"]);
  await tabs.getByRole("link", { name: "Bøtetabell", exact: true }).click();
  const give = async (name: string, id: string, note: string, doubled = false) => {
    await page.getByRole("button", { name: `Gi bot til ${name}`, exact: true }).click();
    const detail = page.locator(`#fines-${id}`);
    await detail.getByRole("combobox", { name: "Bot", exact: true }).selectOption(type!.id);
    const multiplierPicker = detail.getByRole("combobox", { name: "Ekstraregel", exact: true });
    await expect(multiplierPicker).toHaveValue("");
    await expect(multiplierPicker.locator("option:checked")).toHaveText("Vanlig – 1×");
    if (doubled) await multiplierPicker.selectOption(multiplier!.id);
    await expect(detail.getByRole("status")).toHaveText(
      doubled ? /Beløp: 75\s+kr/ : /Beløp: 50\s+kr/,
    );
    await detail.getByLabel("Merknad (valgfritt)").fill(note);
    await detail.getByRole("button", { name: "Gi bot", exact: true }).click();
    await expect(detail.locator(".fine-assignment")).toHaveCount(0);
    await expect(detail.getByText(note, { exact: true })).toBeVisible();
  };
  await give(player.name, player.id, "Fem minutter for sent.");
  await give(coach.name, coach.id, "Kom etter oppvarmingen.", true);
  await give(coach.name, coach.id, "Forsinket neste trening.");
  await expect(page.locator(`[data-fine-member="${coach.id}"] .fine-total`)).toHaveText(/125\s+kr/);
  const order = await page
    .locator("[data-fine-member]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-fine-member")));
  expect(order.indexOf(coach.id)).toBeLessThan(order.indexOf(player.id));
  expect(order.indexOf(player.id)).toBeLessThan(order.indexOf(manager.id));

  const coachRow = page.locator(`[data-fine-member="${coach.id}"]`);
  await coachRow
    .getByRole("button", { name: new RegExp(coach.name) })
    .first()
    .click();
  await expect(page.locator(`#fines-${coach.id}`)).toBeHidden();
  await coachRow
    .getByRole("button", { name: new RegExp(coach.name) })
    .first()
    .click();
  await expect(page.locator(`#fines-${coach.id}`)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator(".standings-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("fines.png"), fullPage: true });

  const otherContext = await browser.newContext();
  try {
    const reader = await otherContext.newPage();
    await login(reader, player);
    await reader.goto("/fines");
    const readerTabs = reader.getByRole("navigation", { name: "Bøter", exact: true });
    await expect(readerTabs.getByRole("link")).toHaveCount(2);
    await expect(reader.getByRole("button", { name: /^Gi bot til/ })).toHaveCount(0);
    const own = reader.locator(`[data-fine-member="${player.id}"]`);
    await expect(own).toHaveClass(/standings-team-highlight/);
    await own.getByRole("button").click();
    await expect(
      reader.locator(`#fines-${player.id}`).getByText("Fem minutter for sent.", { exact: true }),
    ).toBeVisible();
    await expect(readerTabs.getByRole("link")).toHaveText(["Bøtetabell", "Bøter"]);
    await readerTabs.getByRole("link", { name: "Bøter", exact: true }).click();
    const catalogEntry = reader.locator(".fine-catalog li").filter({ hasText: fineName });
    await expect(catalogEntry).toContainText("Etter avtalt starttid.");
    await expect(catalogEntry).toContainText(/50\s+kr/);
    await expect(reader.getByRole("heading", { name: "Ekstraregler", exact: true })).toBeVisible();
    await expect(reader.locator(".fine-catalog li").filter({ hasText: ruleName })).toContainText(
      "1,5×",
    );
    await expect(reader.locator("main form")).toHaveCount(0);
    await expect(reader.getByRole("button", { name: "Opprett bot", exact: true })).toHaveCount(0);
    await reader.goto("/fines?tab=manage");
    await expect(catalogEntry).toBeVisible();
    await reader.goto("/fines?tab=rules");
    await expect(reader.getByRole("table")).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Botregler", exact: true })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }

  const playerHistory = page.locator(`#fines-${player.id}`);
  await playerHistory.getByRole("button", { name: "Annuller bot", exact: true }).click();
  await playerHistory.getByRole("button", { name: "Ja, annuller bot", exact: true }).click();
  await expect(page.locator(`[data-fine-member="${player.id}"] .fine-total`)).toHaveText(/0\s+kr/);
  await expect(playerHistory.getByText("Annullert", { exact: true })).toBeVisible();
});
