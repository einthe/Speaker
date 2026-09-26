import { test, expect } from "@playwright/test";
import { demoPassword } from "../../scripts/demo-seed.mjs";

test("demo includes a Botsjef, ranked fines and fine types", async ({ page }, info) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill("theo@demo.test");
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
  await page.goto("/fines");
  const members = page.locator("[data-fine-member]");
  await expect(members).toHaveCount(14);
  await expect(members.first()).toContainText("Emil Solberg");
  await expect(members.first().locator(".fine-total")).toHaveText(/75\s+kr/);
  await expect(members.nth(1)).toContainText("Markus Strand");
  await expect(members.filter({ hasText: "Theo Aasen" })).toHaveClass(/standings-team-highlight/);
  await expect(page.getByRole("button", { name: /^Gi bot til/ })).toHaveCount(14);
  await members.first().getByRole("button", { name: "Emil Solberg Spiller", exact: true }).click();
  await expect(page.getByText("Fiktivt eksempel: kom fem minutter for sent.")).toBeVisible();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator(".standings-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("demo-fines.png"), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Bøter", exact: true });
  await expect(tabs.getByRole("link")).toHaveText(["Bøtetabell", "Bøter"]);
  await tabs.getByRole("link", { name: "Bøter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Opprett bot", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ny bot", exact: true }).click();
  await expect(page.getByRole("button", { name: "Opprett bot", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ekstraregler", exact: true })).toBeVisible();
});
