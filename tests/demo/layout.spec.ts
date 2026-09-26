import { openNavigation } from "../e2e/support";
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { demoPassword } from "../../scripts/demo-seed.mjs";

async function coach(page: Page, email = "coach@demo.test") {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
}

async function squareCourt(visual: Locator) {
  const court = visual.locator(".court");
  await expect(court).toBeVisible();
  await expect(visual.locator(".court-net")).toHaveText("");
  const shape = await court.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      line: parseFloat(getComputedStyle(node, "::before").top),
      innerHeight: node.clientHeight,
    };
  });
  expect(Math.abs(shape.width - shape.height)).toBeLessThan(1);
  expect(Math.abs(shape.line - shape.innerHeight / 3)).toBeLessThan(1);
  const libero = visual.locator(".libero-card");
  if (await libero.count()) {
    await expect(libero.locator(".jersey")).toBeVisible();
    const a = (await court.boundingBox())!;
    const b = (await libero.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
    expect(Math.abs(b.y + b.height / 2 - (a.y + a.height / 2))).toBeLessThan(1);
  }
  const fits = await court.locator(".court-slot").evaluateAll((slots) =>
    slots.every((slot) => {
      const bounds = slot.getBoundingClientRect();
      return Array.from(slot.children).every((child) => {
        const rect = child.getBoundingClientRect();
        return !rect.height || (rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1);
      });
    }),
  );
  expect(fits).toBe(true);
  await expect(court.locator(".avatar")).toHaveCount(6);
  const setter = court
    .locator(".court-slot")
    .filter({ hasText: "Emil Solberg" })
    .locator(".avatar img");
  const liberoPhoto = libero.locator(".avatar img");
  for (const photo of [setter, liberoPhoto]) {
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const layout = await photo
      .locator("xpath=ancestor::*[contains(@class, 'court-player')]")
      .evaluate((node) => {
        const avatar = node.querySelector(".avatar")!.getBoundingClientRect();
        const shirt = node.querySelector(".jersey")!.getBoundingClientRect();
        return {
          above: avatar.top < shirt.top,
          centered: Math.abs(avatar.x + avatar.width / 2 - shirt.x - shirt.width / 2) < 1,
        };
      });
    expect(layout).toEqual({ above: true, centered: true });
  }
}

test("square courts, side libero and setup controls keep their spatial layout", async ({
  page,
  browser,
}, info) => {
  for (const email of ["player@demo.test", "lucas@demo.test"]) {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
    try {
      const profile = await context.newPage();
      await coach(profile, email);
      await profile.goto("/profile");
      await profile.locator('input[type="file"]').setInputFiles({
        name: "court-avatar.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: {
            width: 80,
            height: 80,
            channels: 3,
            background: email.startsWith("lucas") ? "#407080" : "#be934a",
          },
        })
          .png()
          .toBuffer(),
      });
      await profile.getByRole("button", { name: /^(Last opp|Bytt) profilbilde$/ }).click();
      await expect(profile.locator(".profile-photo-heading .avatar img")).toBeVisible();
    } finally {
      await context.close();
    }
  }
  await coach(page);
  await squareCourt(
    page.locator(".post-card").filter({ hasText: "Klare for Fjordvik" }).locator(".lineup-visual"),
  );
  await page.goto("/schedule");
  await page.getByRole("heading", { name: "NTNUI – Fjordvik", exact: true }).click();
  await squareCourt(page.locator(".match-lineup .lineup-visual"));
  await page.getByRole("link", { name: "Ny versjon", exact: true }).click();
  await expect(page.getByLabel("Dia", { exact: true })).toBeVisible();
  const positions = await page.locator(".lineup-selection select").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { name: node.getAttribute("name"), x: rect.x, y: rect.y };
    }),
  );
  expect(positions.map((p) => p.name)).toEqual([
    "role_opposite",
    "role_m1",
    "role_k1",
    "role_k2",
    "role_m2",
    "role_setter",
  ]);
  expect(positions[0].y).toBe(positions[1].y);
  expect(positions[1].y).toBe(positions[2].y);
  expect(positions[3].y).toBe(positions[4].y);
  expect(positions[4].y).toBe(positions[5].y);
  for (let i = 0; i < 3; i++) expect(positions[i].x).toBe(positions[i + 3].x);
  expect(positions[3].y).toBeGreaterThan(positions[0].y);
  await squareCourt(page.locator(".lineup-preview .lineup-visual"));
  await page.screenshot({ path: info.outputPath("lineup-editor.png"), fullPage: true });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
    await squareCourt(page.locator(".lineup-preview .lineup-visual"));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("responsibility colors remain readable in every palette and roster is named Tropp", async ({
  page,
}, info) => {
  await coach(page);
  const roles = page.locator(".role-post");
  await expect(roles).toHaveCount(2);
  await expect(roles.filter({ hasText: "Pizza etter trening" }).locator(".badge")).toContainText(
    "Sosialansvarlig",
  );
  const colors = await roles.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).borderLeftColor),
  );
  expect(new Set(colors).size).toBe(2);
  for (const palette of ["ntnui", "petrol", "midnight", "plum"]) {
    await page.locator(".account-summary").click();
    await page.getByRole("combobox", { name: "Fargepalett" }).selectOption(palette);
    await page.locator(".account-summary").click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath("responsibility-posts.png"), fullPage: true });
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Tropp", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Tropp", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Tropp/);
  await page.goto("/schedule");
  const training = page.locator(".event-card").filter({ hasText: "Trening: mottak og forsvar" });
  await expect(training.getByText("Trener", { exact: true })).toBeVisible();
  const social = page.locator(".event-card").filter({ hasText: "Lagkveld med pizza" });
  const coral = await training.evaluate((node) => getComputedStyle(node).borderLeftColor);
  expect(coral).not.toBe(await social.evaluate((node) => getComputedStyle(node).borderLeftColor));
  for (const palette of ["ntnui", "petrol", "midnight", "plum"]) {
    await page.locator(".account-summary").click();
    await page.getByRole("combobox", { name: "Fargepalett" }).selectOption(palette);
    await page.locator(".account-summary").click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath("event-colors.png"), fullPage: true });
  await training.click();
  await expect(page.locator(".event-detail").getByText("Trener", { exact: true })).toBeVisible();
  expect(
    await page.locator(".event-detail").evaluate((node) => getComputedStyle(node).borderLeftColor),
  ).toBe(coral);
});

test("schedule filters immediately, preserves history and resets pagination without reloading", async ({
  page,
}) => {
  await coach(page);
  await page.goto("/schedule?history=1&page=2");
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).filterMarker = true;
  });
  const filter = page.getByRole("combobox", { name: "Type hendelse" });
  await expect(page.getByRole("button", { name: "Vis", exact: true })).toHaveCount(0);
  await filter.selectOption("match");
  await expect(page).toHaveURL(/\/schedule\?history=1&type=match$/);
  await expect(page.getByRole("heading", { name: "NTNUI – Vestbyen", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Kommende", exact: true }).click();
  await expect.poll(() => page.locator(".event-card").count()).toBeGreaterThanOrEqual(3);
  await filter.selectOption("practice");
  await expect(page.locator(".event-card")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Trening: mottak og forsvar", exact: true }),
  ).toBeVisible();
  await filter.selectOption("");
  await expect.poll(() => page.locator(".event-card").count()).toBeGreaterThanOrEqual(11);
  await page.goBack();
  await expect(filter).toHaveValue("practice");
  await expect(page.locator(".event-card")).toHaveCount(2);
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).filterMarker),
  ).toBe(true);
});
