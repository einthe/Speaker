import { test, expect } from "@playwright/test";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { provision, login, postFields, openNavigation } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable test backend.");

test("profile pictures upload, persist, replace and remove across the account, posts and roster", async ({
  page,
  request,
}, info) => {
  const account = await provision("player");
  await login(page, account);
  await expect(page.getByText("Privat lagrom", { exact: true })).toHaveCount(0);
  await page.goto("/posts/new");
  await postFields(page, `Profil ${account.name}`);
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Profil ${account.name}`, exact: true }),
  ).toBeVisible();
  const postUrl = page.url();
  await page.locator(".account-summary").click();
  await page.getByRole("link", { name: "Min profil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Min profil", exact: true })).toBeVisible();
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Last opp profilbilde", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "gyldig" })).toBeVisible();
  const picture = async (color: string) => ({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 80, height: 120, channels: 3, background: color } })
      .png()
      .toBuffer(),
  });
  await upload.setInputFiles(await picture("#77964a"));
  await page.getByRole("button", { name: "Last opp profilbilde", exact: true }).click();
  const avatar = page.locator(".account-summary .avatar img");
  await expect(avatar).toBeVisible();
  await expect
    .poll(() => avatar.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const firstSrc = (await avatar.getAttribute("data-source"))!;
  const photo = await page.request.get(firstSrc);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["cache-control"]).toBe("private, no-cache, must-revalidate");
  const etag = photo.headers().etag;
  expect(etag).toBeTruthy();
  const conditional = await page.request.get(firstSrc, { headers: { "If-None-Match": etag } });
  expect(conditional.status()).toBe(304);
  expect((await conditional.body()).length).toBe(0);
  const chosen = (await avatar.getAttribute("data-request-src"))!;
  const thumbnail = await page.request.get(chosen);
  expect((await sharp(await thumbnail.body()).metadata()).width).toBeLessThanOrEqual(128);
  expect((await request.get(firstSrc)).status()).toBe(403);
  await page.reload();
  await expect(avatar).toHaveAttribute("data-source", firstSrc);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("profile.png"), fullPage: true });
  await page.goto("/roster");
  const card = page.locator(".player-card").filter({ hasText: account.name });
  await expect(card.locator(".avatar img")).toHaveAttribute("data-source", firstSrc);
  await page.goto(postUrl);
  await expect(page.locator(".post-header .avatar img")).toHaveAttribute("data-source", firstSrc);
  await page.goto("/profile");
  await upload.setInputFiles(await picture("#167d8d"));
  if (process.env.E2E_LOCAL_ADAPTER === "1") {
    await request.post(`${process.env.E2E_SUPABASE_URL}/__test/fail`, {
      headers: { Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_ROLE_KEY}` },
      data: { operation: "upload" },
    });
    await page.getByRole("button", { name: "Bytt profilbilde", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "kunne ikke lastes opp" }),
    ).toBeVisible();
    await expect(avatar).toHaveAttribute("data-source", firstSrc);
    await upload.setInputFiles(await picture("#167d8d"));
  }
  await page.getByRole("button", { name: "Bytt profilbilde", exact: true }).click();
  await expect(avatar).not.toHaveAttribute("data-source", firstSrc);
  await expect
    .poll(() => avatar.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const secondSrc = (await avatar.getAttribute("data-source"))!;
  expect((await page.request.get(firstSrc, { headers: { "If-None-Match": etag } })).status()).toBe(
    404,
  );
  const replacement = await page.request.get(secondSrc, { headers: { "If-None-Match": etag } });
  expect(replacement.status()).toBe(200);
  expect(replacement.headers().etag).not.toBe(etag);
  const oldPath = new URL(firstSrc, page.url()).searchParams.get("v");
  const signed = await account.service.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (signed.error) throw signed.error;
  expect(
    (await account.service.storage.from("profile-photos").download(oldPath!)).error,
  ).not.toBeNull();
  await page.getByRole("button", { name: "Fjern profilbilde", exact: true }).click();
  await expect(avatar).toHaveCount(0);
  expect((await page.request.get(secondSrc)).status()).toBe(404);
  await page.goto("/roster");
  await expect(card).toBeVisible();
  await expect(card.locator(".avatar img")).toHaveCount(0);
  await page.goto(postUrl);
  await expect(page.locator(".post-header .avatar img")).toHaveCount(0);
});

test("shortcuts open the correct upcoming filter on desktop and mobile", async ({ page }, info) => {
  await login(page, await provision("player"));
  const shortcuts = page.getByRole("navigation", { name: "Snarveier" });
  for (const [label, type] of [
    ["Kamper", "match"],
    ["Dugnader", "volunteer_work"],
    ["Sosialt", "social"],
  ]) {
    await page.goto("/schedule?history=1&page=2");
    await openNavigation(page);
    const link = shortcuts.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/schedule\\?type=${type}$`));
    await expect(page.getByRole("combobox", { name: "Type hendelse" })).toHaveValue(type);
    await openNavigation(page);
    await expect(link).toHaveAttribute("aria-current", "page");
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Lukk meny" }).click();
    await expect(page.getByRole("link", { name: "Kommende", exact: true })).toHaveClass(/selected/);
  }
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openNavigation(page);
  if (info.project.name === "mobile") {
    await expect.poll(async () => (await page.locator(".mobile-drawer").boundingBox())?.x).toBe(0);
  }
  const linkBounds = await page.locator(".sidebar:visible nav .nav-link").evaluateAll((links) =>
    links.map((link) => {
      const bounds = link.getBoundingClientRect();
      return {
        text: link.textContent,
        left: bounds.left,
        right: bounds.right,
        scroll: link.scrollWidth,
        width: link.clientWidth,
        viewport: innerWidth,
      };
    }),
  );
  for (const bounds of linkBounds) {
    expect(bounds.left, bounds.text ?? "").toBeGreaterThanOrEqual(0);
    expect(bounds.right, bounds.text ?? "").toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.scroll, bounds.text ?? "").toBeLessThanOrEqual(bounds.width);
  }
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("shortcuts.png"), fullPage: true });
});
