import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login, postFields, provision, openNavigation } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable backend.");

test("returning to sections keeps photos visible during background refresh and clears them on logout", async ({
  page,
}) => {
  const account = await provision("player");
  await login(page, account);
  await page.clock.install();
  await page.goto("/posts/new");
  const title = `Lagret bilde ${account.name}`;
  await postFields(page, title);
  const picture = (color: string) =>
    sharp({ create: { width: 900, height: 600, channels: 3, background: color } })
      .webp()
      .toBuffer();
  await page
    .locator('input[name="image"]')
    .setInputFiles({ name: "team.webp", mimeType: "image/webp", buffer: await picture("#167d8d") });
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  const gallery = page.getByRole("region", { name: `Bilder til ${title}` });
  const frame = gallery.locator(".post-image-frame");
  const img = frame.locator("img");
  await expect(frame).toHaveAttribute("data-state", "loaded");
  // First visit the feed using client-side navigation, matching the real sidebar.
  const navigate = async (label: string) => {
    await openNavigation(page);
    await page.locator(".sidebar:visible").getByRole("link", { name: label, exact: true }).click();
  };
  await navigate("Innlegg");
  await expect(frame).toHaveAttribute("data-state", "loaded");
  await expect
    .poll(() =>
      img.evaluate(
        (image) =>
          !!image.dataset.loadedSrc && image.dataset.loadedSrc === image.dataset.requestSrc,
      ),
    )
    .toBe(true);
  const original = await img.getAttribute("src");
  expect(original).toMatch(/^blob:/);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let mode: "refresh" | "offline" | "deleted" = "refresh";
  let requests = 0;
  let completed = 0;
  const changedPhoto = await picture("#db682f");
  const imageRoute = `**${(await img.getAttribute("data-source"))!.split("?")[0]}*`;
  await page.route(imageRoute, async (route) => {
    requests++;
    if (mode === "offline") await route.abort();
    else if (mode === "deleted") await route.fulfill({ status: 404, body: "" });
    else {
      if (requests === 1) expect(route.request().headers()["if-none-match"]).toBeTruthy();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "image/webp",
        headers: { ETag: '"updated-image"' },
        body: changedPhoto,
      });
    }
    completed++;
  });
  try {
    await navigate("Terminliste");
    await page.clock.fastForward(31_000);
    await navigate("Innlegg");
    await expect.poll(() => requests).toBeGreaterThan(0);
    // The network response is still held back, but the actual saved image is visible.
    await expect(frame).toHaveAttribute("data-state", "loaded");
    await expect(img).toHaveAttribute("src", original!);
    await expect(frame.getByText("Laster bilde …")).toHaveCount(0);
    await expect
      .poll(() => img.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const height = (await frame.boundingBox())!.height;
    release();
    await expect(img).not.toHaveAttribute("src", original!);
    expect((await frame.boundingBox())!.height).toBeCloseTo(height, 0);
    const updated = await img.getAttribute("src");
    mode = "offline";
    const previousRequests = requests;
    await navigate("Terminliste");
    await page.clock.fastForward(31_000);
    await navigate("Innlegg");
    await expect.poll(() => completed).toBeGreaterThan(previousRequests);
    await expect(img).toHaveAttribute("src", updated!);
    await expect(frame).toHaveAttribute("data-state", "loaded");
    mode = "deleted";
    await navigate("Terminliste");
    await navigate("Innlegg");
    await expect(frame).toHaveAttribute("data-state", "error");
    await expect(img).not.toHaveAttribute("src");

    // Restore an image and verify the auth boundary also revokes its in-memory URL.
    mode = "refresh";
    await gallery.getByRole("button", { name: "Prøv igjen" }).click();
    await expect(frame).toHaveAttribute("data-state", "loaded");
    const savedUrl = (await img.getAttribute("src"))!;
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await page.locator(".account-summary").click();
    await page.getByRole("button", { name: "Logg ut", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    expect(navigations.length).toBeGreaterThan(0);
    expect(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return true;
        } catch {
          return false;
        }
      }, savedUrl),
    ).toBe(false);
  } finally {
    release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
