import { test, expect } from "@playwright/test";
import { demoPassword } from "../../scripts/demo-seed.mjs";

test("the local demo has threaded discussions and works without a Giphy key", async ({
  page,
}, testInfo) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill("player@demo.test");
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("link", { name: "Baneoppsett til helgen", exact: true }).click();
  await expect(page.getByText("Jeg blir også med.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reager med et meme" })).toBeDisabled();
  await expect(page.getByText("Memes er ikke tilgjengelige ennå.")).toBeVisible();
  await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Kommenter innlegget", exact: true })
    .fill(`Kommentar uten API-nøkkel ${testInfo.project.name}`);
  await page.getByRole("button", { name: "Publiser kommentar" }).click();
  await expect(
    page.getByText(`Kommentar uten API-nøkkel ${testInfo.project.name}`, { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("discussion.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/schedule");
  await page.getByRole("heading", { name: "NTNUI – Fjordvik", exact: true }).click();
  await expect(page.getByText("Gleder meg til kamp!", { exact: true })).toBeVisible();
});
