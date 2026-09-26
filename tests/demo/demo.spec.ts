import { test, expect, type Page } from "@playwright/test";
import { demoPassword } from "../../scripts/demo-seed.mjs";

async function signIn(page: Page, account: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill(`${account}@demo.test`);
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
}

test("seeded coach sees private images, published lineups, draft matches and the full roster", async ({
  page,
}) => {
  await signIn(page, "coach");
  await expect(
    page.getByRole("heading", { name: "Baneoppsett til helgen", exact: true }),
  ).toBeVisible();
  const picture = page.getByRole("img", {
    name: "Illustrasjon av en volleyballbane – lokalt eksempelbilde",
  });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.locator(".post-card").filter({ hasText: "Klare for Fjordvik" }).locator(".court"),
  ).toBeVisible();
  await page.goto("/roster");
  await expect.poll(() => page.locator(".player-card").count()).toBeGreaterThanOrEqual(12);
  await expect(page.getByRole("heading", { name: "Emil Solberg", exact: true })).toBeVisible();
  await page.goto("/schedule");
  await page.getByRole("heading", { name: "Bortekamp mot Nordstrand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bortekamp mot Nordstrand", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Fortsett utkast", exact: true })).toBeVisible();
  await page.goto("/lineups/new");
  await expect(
    page.getByRole("heading", { name: "Ny kampoppstilling", exact: true }),
  ).toBeVisible();
});

test("demo player can create, edit and delete a post through the real application", async ({
  page,
}, testInfo) => {
  await signIn(page, "player");
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kampoppstilling", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
  const title = `Lokalt prøveinnlegg ${testInfo.project.name}`;
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Innlegg", { exact: true }).fill("En midlertidig melding i demodatabasen.");
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  await page.getByLabel("Innlegg", { exact: true }).fill("Endret lokalt.");
  await page.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(page.getByText("Endret lokalt.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Slett innlegg", exact: true }).click();
  await page.getByRole("button", { name: "Ja, slett innlegg", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
});

test("demo admin can approve a fictional registration while disabled accounts remain blocked", async ({
  page,
}, testInfo) => {
  await signIn(page, "disabled");
  await expect(page).toHaveURL(/\/auth\/rejected$/);
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  // Separate pending accounts keep desktop/mobile runs independent.
  await page.goto("/auth/sign-up");
  const name = `Demo ny spiller ${testInfo.project.name}`;
  const email = `signup-${testInfo.project.name}@demo.test`;
  await page.getByLabel("Fullt navn").fill(name);
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByLabel("Draktnummer").fill(testInfo.project.name === "mobile" ? "92" : "91");
  await page.getByRole("button", { name: "Opprett konto", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/pending(?:\?|$)/);
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
  await page.goto("/admin/users");
  const account = page.locator("details.admin-user").filter({ hasText: email });
  await account.locator("summary").first().click();
  await account.locator('select[name="base_role"]').selectOption("player");
  await account.locator('select[name="account_status"]').selectOption("approved");
  await account.getByRole("button", { name: "Behandle forespørsel", exact: true }).click();
  await expect(account.getByRole("status")).toContainText("lagret");
  await page.goto("/roster");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});
