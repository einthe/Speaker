import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login, postFields, provision } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable test backend.");

test("image variants revalidate privately and refuse revoked access and deleted attachments", async ({
  page,
  request,
}) => {
  const account = await provision("player");
  await login(page, account);
  await page.goto("/posts/new");
  await postFields(page, `Bildevarianter ${account.name}`);
  await page.locator('input[name="image"]').setInputFiles({
    name: "large.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: "#167d8d" },
    })
      .jpeg()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  const img = page.locator("img.post-image");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const path = (await img.getAttribute("data-source"))!;
  const small = await page.request.get(`${path}?w=480`);
  const large = await page.request.get(`${path}?w=1600`);
  expect(small.status()).toBe(200);
  expect(large.status()).toBe(200);
  expect((await sharp(await small.body()).metadata()).width).toBe(480);
  expect((await sharp(await large.body()).metadata()).width).toBe(1600);
  expect((await small.body()).length).toBeLessThan((await large.body()).length);
  expect(small.headers()["cache-control"]).toBe("private, no-cache, must-revalidate");
  expect(small.headers().vary.toLowerCase()).toContain("cookie");
  const headers = { "If-None-Match": small.headers().etag };
  expect((await page.request.get(`${path}?w=480`, { headers })).status()).toBe(304);
  expect((await page.request.get(`${path}?w=1600`, { headers })).status()).toBe(200);
  expect((await request.get(`${path}?w=480`, { headers })).status()).toBe(403);
  expect((await page.request.get(`${path}?w=99999`)).status()).toBe(400);

  if (process.env.E2E_LOCAL_ADAPTER === "1") {
    const failure = (count: number) =>
      request.post(`${process.env.E2E_SUPABASE_URL}/__test/fail`, {
        headers: { Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_ROLE_KEY}` },
        data: { operation: "download", count },
      });
    await failure(10);
    try {
      // Metadata/access checks still work; cached bytes must not need a Storage download.
      expect((await page.request.get(`${path}?w=480`)).status()).toBe(200);
      expect((await page.request.get(`${path}?w=480`, { headers })).status()).toBe(304);
    } finally {
      await failure(0);
    }
  }

  const disable = await account.service
    .from("profiles")
    .update({ account_status: "disabled" })
    .eq("id", account.id);
  expect(disable.error).toBeNull();
  const denied = await page.request.get(`${path}?w=480`, { headers });
  expect(denied.status()).toBe(403);
  expect(denied.headers()["cache-control"]).toBe("private, no-store");
  const enable = await account.service
    .from("profiles")
    .update({ account_status: "approved" })
    .eq("id", account.id);
  expect(enable.error).toBeNull();
  await page.getByRole("button", { name: "Fjern bilde", exact: true }).click();
  await page.getByRole("button", { name: "Ja, fjern bilde", exact: true }).click();
  await expect(img).toHaveCount(0);
  expect((await page.request.get(`${path}?w=480`, { headers })).status()).toBe(404);
});
