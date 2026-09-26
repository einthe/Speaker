import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { login, provision, postFields } from "./support";

test("multiple private images support desktop arrows, mobile swipes and individual removal", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const account = await provision("player");
  await login(page, account);
  const files = await Promise.all(
    [1, 2, 3].map(async (n) => ({
      name: `bilde-${n}.png`,
      mimeType: "image/png",
      buffer: await sharp(randomBytes(900 * 900 * 3), {
        raw: { width: 900, height: 900, channels: 3 },
      })
        .png()
        .toBuffer(),
    })),
  );
  // The combined upload exceeds Vercel's limit; each individual request must stay below it.
  expect(files.reduce((sum, file) => sum + file.buffer.length, 0)).toBeGreaterThan(
    4.5 * 1024 * 1024,
  );
  const uploadSizes: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      uploadSizes.push(request.postDataBuffer()?.length ?? 0);
  });
  await page.goto("/posts/new");
  const title = `Bildegalleri ${account.name}`;
  await postFields(page, title);
  await page.locator('input[name="image"]').setInputFiles(files);
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const gallery = page.getByRole("region", { name: `Bilder til ${title}` });
  await expect(gallery.locator("img")).toHaveCount(3);
  expect(Math.max(...uploadSizes)).toBeLessThan(4.5 * 1024 * 1024);
  await expect(gallery.getByRole("button", { name: "Vis bilde 1 av 3" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await gallery.scrollIntoViewIfNeeded();
  if (info.project.name === "mobile") {
    const box = (await gallery.locator(".post-gallery-track").boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const point = (step: number) => ({
      x: box.x + box.width * (0.85 - step * 0.07),
      y: box.y + box.height / 2,
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(0)] });
    for (let step = 1; step <= 10; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [point(step)],
      });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    await gallery.locator(".post-gallery-stage").hover();
    await gallery.getByRole("button", { name: "Neste bilde", exact: true }).click();
  }
  await expect(gallery.getByRole("button", { name: "Vis bilde 2 av 3" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await gallery.locator(".post-gallery-track").focus();
  await page.keyboard.press("ArrowRight");
  await expect(gallery.getByRole("button", { name: "Vis bilde 3 av 3" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await gallery.screenshot({ path: info.outputPath("post-gallery.png") });
  await gallery.getByRole("button", { name: "Fjern bilde", exact: true }).click();
  await gallery.getByRole("button", { name: "Ja, fjern bilde", exact: true }).click();
  await expect(gallery.locator("img")).toHaveCount(2);
  await page.reload();
  await expect(gallery.locator("img")).toHaveCount(2);
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  await page.locator('input[name="image"]').setInputFiles(files[2]);
  await page.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(gallery.locator("img")).toHaveCount(3);
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  const response = await page.request.get((await icon.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("<svg");
});
