import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login, postFields, provision } from "./support";

test("photos reserve space while loading, after failure and for older uploads", async ({
  page,
}, info) => {
  const account = await provision("player");
  await login(page, account);
  await page.goto("/posts/new");
  const title = `Bildelasting ${account.name}`;
  await postFields(page, title);
  await page.locator('input[name="image"]').setInputFiles({
    name: "landscape.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({
      create: { width: 1600, height: 800, channels: 3, background: "#167d8d" },
    })
      .jpeg()
      .toBuffer(),
  });
  let release = () => {};
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = false;
  await page.route("**/media/**", async (route) => {
    await gate;
    if (fail) await route.abort();
    else await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const frame = page
      .getByRole("region", { name: `Bilder til ${title}` })
      .locator(".post-image-frame");
    await expect(frame).toHaveAttribute("data-state", "loading");
    await frame.scrollIntoViewIfNeeded();
    await expect(frame.getByText("Laster bilde …")).toBeVisible();
    const before = (await frame.boundingBox())!;
    expect(before.height).toBeGreaterThan(100);
    expect(before.width / before.height).toBeCloseTo(2, 1);
    await frame.screenshot({ path: info.outputPath("image-loading.png") });
    release();
    await expect(frame).toHaveAttribute("data-state", "loaded");
    const after = (await frame.boundingBox())!;
    expect(Math.abs(after.height - before.height)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);

    const id = (await frame.locator("img").getAttribute("data-source"))!
      .split("/media/")[1]
      .split("?")[0];
    const metadata = await account.service
      .from("post_media")
      .select("width,height")
      .eq("id", id)
      .single();
    expect(metadata.data).toEqual({ width: 1600, height: 800 });
    const legacy = await account.service
      .from("post_media")
      .update({ width: null, height: null })
      .eq("id", id);
    expect(legacy.error).toBeNull();
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.goto("/feed", { waitUntil: "domcontentloaded" });
    await frame.scrollIntoViewIfNeeded();
    await expect(frame).toHaveAttribute("data-state", "loading");
    const legacyBefore = (await frame.boundingBox())!;
    expect(legacyBefore.width / legacyBefore.height).toBeCloseTo(4 / 3, 1);
    fail = true;
    release();
    await expect(frame.getByText("Bildet kunne ikke lastes.")).toBeVisible();
    expect((await frame.boundingBox())!.height).toBeCloseTo(legacyBefore.height, 0);
    fail = false;
    await frame.getByRole("button", { name: "Prøv igjen" }).click();
    await expect(frame).toHaveAttribute("data-state", "loaded");
    expect((await frame.boundingBox())!.height).toBeCloseTo(legacyBefore.height, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    release();
  }
});
