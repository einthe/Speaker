import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPassword } from "../../scripts/demo-seed.mjs";

test("role choices include secondary positions, rotate, and survive saving and reopening", async ({
  page,
}, info) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill("coach@demo.test");
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
  await page.goto("/roster");
  const jonas = page.locator(".player-card").filter({ hasText: "Jonas Vik" });
  await expect(jonas.locator(".player-position")).toContainText("Kant / Dia / Libero");
  await page.goto("/schedule/new");
  await page.getByLabel("Tittel", { exact: true }).fill(`Rotasjon ${info.project.name}`);
  await page.getByLabel("Starter", { exact: true }).fill("2027-03-10T18:00");
  await page.getByLabel("Motstander", { exact: true }).fill("Rotasjonstest");
  await page.getByRole("button", { name: "Opprett hendelse" }).click();
  await page.getByRole("link", { name: "Lag kampoppstilling", exact: true }).click();
  const k1 = page.getByRole("combobox", { name: "K1", exact: true });
  await expect(k1.locator("option")).toHaveText([
    "Velg spiller",
    "#10 Henrik Moen",
    "#7 Isak Holm",
    "#4 Jonas Vik",
  ]);
  await expect(page.getByLabel("Legger", { exact: true }).locator("option")).toHaveText([
    "Velg spiller",
    "#1 Emil Solberg",
    "#5 Theo Aasen",
  ]);
  const jonasId = await k1.locator("option").filter({ hasText: "Jonas Vik" }).getAttribute("value");
  for (const name of ["K2", "Dia", "Libero"])
    await expect(
      page.getByLabel(name, { exact: true }).locator(`option[value="${jonasId}"]`),
    ).toHaveJSProperty("disabled", false);
  await k1.selectOption(jonasId!);
  for (const name of ["K2", "Dia", "Libero"])
    await expect(
      page.getByLabel(name, { exact: true }).locator(`option[value="${jonasId}"]`),
    ).toHaveJSProperty("disabled", true);
  for (const [role, name] of [
    ["Legger", "#1 Emil Solberg"],
    ["M1", "#6 Oliver Dahl"],
    ["Dia", "#8 Noah Nilsen"],
    ["K2", "#10 Henrik Moen"],
    ["M2", "#12 Oskar Bakke"],
    ["Libero", "#3 Lucas Eide"],
  ]) {
    await page.getByLabel(role, { exact: true }).selectOption({ label: name });
  }
  const rotation = page.getByRole("combobox", { name: "Leggerens startposisjon", exact: true });
  for (const start of [1, 2, 3, 4, 5, 6]) {
    await rotation.selectOption(String(start));
    const position = await page
      .locator(".court-slot")
      .filter({ hasText: "Emil Solberg" })
      .locator(".rotation-number")
      .innerText();
    expect(position).toBe(String(start));
    await expect(
      page.locator(".court-slot").filter({ hasText: "Jonas Vik" }).locator(".rotation-number"),
    ).toHaveText(String((start % 6) + 1));
  }
  await rotation.selectOption("3");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("role-lineup.png"), fullPage: true });
  await page.getByRole("button", { name: "Lagre utkast", exact: true }).click();
  await page.getByRole("link", { name: "Fortsett utkast", exact: true }).click();
  await expect(rotation).toHaveValue("3");
  await expect(k1).toHaveValue(jonasId!);
  await page.getByRole("button", { name: "Publiser oppstilling", exact: true }).click();
  await expect(page.getByText("Versjon 2 · Publisert", { exact: false })).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".court-slot").filter({ hasText: "Emil Solberg" }).locator(".rotation-number"),
  ).toHaveText("3");
  await page.getByRole("link", { name: "Ny versjon", exact: true }).click();
  await expect(rotation).toHaveValue("3");
  await expect(k1).toHaveValue(jonasId!);
});
