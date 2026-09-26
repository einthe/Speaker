import { test, expect } from "@playwright/test";
import { login, provision } from "./support";

test("plain-text post links work in detail and feed, retain punctuation and remain editable", async ({
  page,
  context,
}) => {
  const account = await provision("player");
  const title = `Lenker ${account.name}`;
  const url = "https://example.com/dugnad?lag=D2A#info";
  const body = `Meld deg på (${url}).\n\nSe også volleyball.no og www.volleyball.no.\n<img src=x onerror=alert(1)> javascript:alert(1)\nhttps://example.com/${"lang-lenke-".repeat(35)}`;
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Lenken virker</h1>" }),
  );
  await login(page, account);
  await page.goto("/posts/new");
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Innlegg", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const postUrl = page.url();
  const content = page.locator(".post-body");
  await expect(content).toHaveText(body);
  await expect(content.getByRole("link", { name: url, exact: true })).toHaveAttribute("href", url);
  await expect(content.getByRole("link", { name: "volleyball.no", exact: true })).toHaveAttribute(
    "href",
    "https://volleyball.no/",
  );
  await expect(content.locator("img, script")).toHaveCount(0);
  await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
  const opened = page.waitForEvent("popup");
  await content.getByRole("link", { name: url, exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL(url);
  await expect(popup.getByRole("heading", { name: "Lenken virker" })).toBeVisible();
  await popup.close();
  await expect(page).toHaveURL(postUrl);
  await page.goto("/feed");
  const card = page
    .locator(".post-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card.getByRole("link", { name: url, exact: true })).toHaveAttribute("href", url);
  await expect(card.getByRole("link", { name: url, exact: true })).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(postUrl);
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  await expect(page.getByLabel("Innlegg", { exact: true })).toHaveValue(body);
  await page.getByLabel("Innlegg", { exact: true }).fill(`${body}\nhttps://example.org/oppdatert`);
  await page.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "https://example.org/oppdatert", exact: true }),
  ).toHaveAttribute("href", "https://example.org/oppdatert");
});

test("event descriptions also display clickable links", async ({ page }) => {
  const account = await provision("coach");
  await login(page, account);
  await page.goto("/schedule/new");
  await page.getByLabel("Type hendelse").selectOption("practice");
  const title = `Trening ${account.name}`;
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Starter", { exact: true }).fill("2030-04-05T18:00");
  await page
    .getByLabel("Beskrivelse", { exact: true })
    .fill("Les planen: https://example.com/trening.");
  await page.getByRole("button", { name: "Opprett hendelse", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator(".post-body").getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com/trening",
  );
});
