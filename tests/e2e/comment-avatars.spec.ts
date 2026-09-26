import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login, provision, postFields } from "./support";

test("post and event comments and replies show current private profile photos", async ({
  page,
  browser,
  request,
}) => {
  const author = await provision("coach");
  await login(page, author);
  const targets: string[] = [];
  await page.goto("/posts/new");
  const title = `Profilbilder ${author.name}`;
  await postFields(page, title);
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  targets.push(page.url());
  await page.goto("/schedule/new");
  await page.getByLabel("Type hendelse").selectOption("practice");
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Starter", { exact: true }).fill("2030-04-05T18:00");
  await page.getByRole("button", { name: "Opprett hendelse", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  targets.push(page.url());
  for (const url of targets) {
    await page.goto(url);
    await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
    await page.getByRole("textbox", { name: /^Kommenter / }).fill("Kommentar uten profilbilde");
    await page.getByRole("button", { name: "Publiser kommentar", exact: true }).click();
    const root = page.locator(".comment-threads > li > article").first();
    await expect(root.getByText("Kommentar uten profilbilde")).toBeVisible();
    await expect(root.locator(".avatar img")).toHaveCount(0);
    await root.getByRole("button", { name: "Svar", exact: true }).click();
    await root
      .getByRole("textbox", { name: `Svar til ${author.name}`, exact: true })
      .fill("Svar med samme forfatter");
    await root.getByRole("button", { name: "Publiser svar", exact: true }).click();
    await expect(page.getByText("Svar med samme forfatter")).toBeVisible();
  }
  const photo = async (color: string) => ({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 80, height: 80, channels: 3, background: color } })
      .png()
      .toBuffer(),
  });
  let previous = "";
  for (const color of ["#567890", "#abcdef"]) {
    await page.goto("/profile");
    await page.locator('input[type="file"]').setInputFiles(await photo(color));
    await page
      .getByRole("button", {
        name: previous ? "Bytt profilbilde" : "Last opp profilbilde",
        exact: true,
      })
      .click();
    const avatar = page.locator(".account-summary .avatar img");
    await expect(avatar).toBeVisible();
    if (previous) await expect(avatar).not.toHaveAttribute("data-source", previous);
    const src = (await avatar.getAttribute("data-source"))!;
    previous = src;
    expect((await request.get(src)).status()).toBe(403);
    for (const url of targets) {
      await page.goto(url);
      const images = page.locator(".comment-header .avatar img");
      await expect(images).toHaveCount(2);
      for (const image of await images.all()) {
        await expect(image).toHaveAttribute("data-source", src);
        await expect
          .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0);
      }
    }
  }
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await login(other, await provision("player"));
    for (const url of targets) {
      await other.goto(url);
      await expect(other.locator(".comment-header .avatar img")).toHaveCount(2);
      await expect(other.locator(".comment-header .avatar img").first()).toHaveAttribute(
        "data-source",
        previous,
      );
    }
  } finally {
    await context.close();
  }
  await page.goto("/profile");
  await page.getByRole("button", { name: "Fjern profilbilde", exact: true }).click();
  await expect(page.locator(".account-summary .avatar img")).toHaveCount(0);
  for (const url of targets) {
    await page.goto(url);
    await expect(page.locator(".comment-header .avatar")).toHaveCount(2);
    await expect(page.locator(".comment-header .avatar img")).toHaveCount(0);
  }
});
