import { openNavigation } from "./support";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { provision, login, postFields } from "./support";
import { accessScope } from "../../src/lib/cache/contract";
import type { Profile } from "../../src/lib/domain";
const configured = Boolean(
  process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
);
if (process.env.E2E_REQUIRE_BACKEND === "1" && !configured) throw new Error("Missing test backend");
test.skip(!configured, "Requires a disposable backend.");

test("cached navigation, entity reuse and stale refresh do not wait for read responses", async ({
  page,
}, testInfo) => {
  const account = await provision("coach");
  await login(page, account);
  const title = `Cached ${randomUUID().slice(0, 8)}`;
  await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
  await postFields(page, title);
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const postUrl = page.url();
  const postId = postUrl.split("/").at(-1)!;
  await page.goto("/schedule/new");
  const eventTitle = `Kamp ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Tittel", { exact: true }).fill(eventTitle);
  await page.getByLabel("Starter", { exact: true }).fill("2027-02-15T18:00");
  await page.getByLabel("Motstander", { exact: true }).fill("Cache opponent");
  await page.getByRole("button", { name: "Opprett hendelse" }).click();
  await expect(page.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  const eventUrl = page.url();
  // A direct visit initializes a new cache: detail entries have not been read.
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator(".small-event").filter({ hasText: eventTitle })).toBeVisible();
  await expect(page.locator(".team-count")).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__documentMarker = "same-document";
  });
  let documents = 0;
  const reads: Record<string, number> = {};
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/team/")) reads[url.pathname] = (reads[url.pathname] ?? 0) + 1;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/team/post?**", async (route) => {
    await held;
    await route.continue();
  });
  const started = Date.now();
  await page.getByRole("heading", { name: title, exact: true }).getByRole("link").click();
  await expect(page).toHaveURL(postUrl);
  // This assertion must pass while the canonical read is deliberately held.
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const placeholderMs = Date.now() - started;
  const postResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/team/post",
  );
  release();
  await postResponse;
  await expect.poll(() => reads["/api/team/post"]).toBe(1);
  await page.unroute("**/api/team/post?**");
  await page.getByRole("link", { name: "Tilbake til innlegg" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(reads["/api/team/posts"] ?? 0).toBe(0);
  let releaseEvent!: () => void;
  const heldEvent = new Promise<void>((resolve) => {
    releaseEvent = resolve;
  });
  await page.route("**/api/team/event?**", async (route) => {
    await heldEvent;
    await route.continue();
  });
  await page.locator(".small-event").filter({ hasText: eventTitle }).click();
  await expect(page).toHaveURL(eventUrl);
  await expect(page.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  const eventResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/team/event",
  );
  releaseEvent();
  await eventResponse;
  await page.unroute("**/api/team/event?**");
  await page.getByRole("link", { name: "Tilbake til terminlisten" }).click();
  await expect(page.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  expect(reads["/api/team/events"] ?? 0).toBe(0);
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Tropp", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Tropp", exact: true })).toBeVisible();
  expect(reads["/api/team/roster"] ?? 0).toBe(0);
  await page.getByLabel("Søk etter spiller").fill("Starter");
  await expect(page.getByRole("button", { name: "Søk", exact: true })).toHaveCount(0);
  await page.getByLabel("Søk etter spiller").press("Enter");
  await expect(page).toHaveURL(/\/roster\?q=Starter/);
  await page.getByLabel("Filtrer på posisjon").selectOption("outside_hitter");
  await expect(page).toHaveURL(/q=Starter&position=outside_hitter/);
  await page.getByLabel("Filtrer på posisjon").selectOption("");
  await expect(page).toHaveURL(/q=Starter&position=$/);
  await page.goBack();
  await expect(page.getByLabel("Filtrer på posisjon")).toHaveValue("outside_hitter");
  await page.getByRole("link", { name: "Nullstill", exact: true }).click();
  await expect(page).toHaveURL(/\/roster$/);
  await expect(page.getByLabel("Søk etter spiller")).toHaveValue("");
  await expect(page.getByLabel("Filtrer på posisjon")).toHaveValue("");
  expect(reads["/api/team/roster"] ?? 0).toBe(0);
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Terminliste", exact: true })
    .click();
  await page.getByLabel("Type hendelse", { exact: true }).selectOption("match");
  await expect(page).toHaveURL(/type=match/);
  await expect(page.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(35_000);
  const updatedTitle = `${title} oppdatert`;
  const changed = await account.service
    .from("posts")
    .update({ title: updatedTitle })
    .eq("id", postId);
  if (changed.error) throw changed.error;
  let releaseRefresh!: () => void;
  const heldRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/team/posts?**", async (route) => {
    await heldRefresh;
    await route.continue();
  });
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Innlegg", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(await page.locator(".skeleton").count()).toBe(0);
  releaseRefresh();
  await expect(page.getByRole("heading", { name: updatedTitle, exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__documentMarker),
  ).toBe("same-document");
  expect(documents).toBe(0);
  await testInfo.attach("navigation-evidence.json", {
    body: JSON.stringify({
      placeholderMs,
      documents,
      reads,
      canonicalResponseHeldUntilContentVisible: true,
    }),
    contentType: "application/json",
  });
});

test("private reads enforce scope, permissions, sign-out and account changes", async ({
  page,
  request,
}) => {
  const coach = await provision("coach");
  const player = await provision("player");
  expect((await request.get("/api/team/roster")).status()).toBe(401);
  await login(page, coach);
  const scope = accessScope(
    { id: coach.id, base_role: "coach", account_status: "approved" } as Profile,
    [],
  );
  const roster = await page.request.get("/api/team/roster", { headers: { "X-Team-Scope": scope } });
  expect(roster.status()).toBe(200);
  expect(roster.headers()["cache-control"]).toBe("private, no-store");
  expect(
    (await page.request.get("/api/team/users", { headers: { "X-Team-Scope": scope } })).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get("/api/team/roster", { headers: { "X-Team-Scope": "other-user" } })
    ).status(),
  ).toBe(409);
  await page.getByRole("link", { name: "Kampoppstilling", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ny kampoppstilling", exact: true }),
  ).toBeVisible();
  await page.locator(".account-summary").click();
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await login(page, player);
  await expect(page.getByRole("link", { name: "Kampoppstilling", exact: true })).toHaveCount(0);
  await page.goto("/lineups/new");
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.locator(".team-count")).toHaveCount(1);
  const disabled = await player.service
    .from("profiles")
    .update({ account_status: "disabled" })
    .eq("id", player.id);
  if (disabled.error) throw disabled.error;
  await page.clock.install();
  await page.clock.fastForward(16_000);
  await openNavigation(page);
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("link", { name: "Tropp", exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth\/rejected$/);
  await expect(page.locator(".player-card")).toHaveCount(0);
});

test("a background refresh cannot silently advance an unsaved post edit version", async ({
  page,
}) => {
  const account = await provision("player");
  await login(page, account);
  await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
  const title = `Stale ${randomUUID().slice(0, 8)}`;
  await postFields(page, title);
  await page.getByRole("button", { name: "Publiser innlegg" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  await page.getByRole("link", { name: "Rediger", exact: true }).click();
  const version = await page.locator('input[name="expected_updated_at"]').inputValue();
  await page.getByLabel("Innlegg", { exact: true }).fill("Unsaved local text");
  const changed = await account.service
    .from("posts")
    .update({ title: `${title} remote`, updated_at: new Date(Date.now() + 1000).toISOString() })
    .eq("id", id);
  if (changed.error) throw changed.error;
  await page.clock.install();
  await page.clock.fastForward(35_000);
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/team/post",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(page.getByLabel("Innlegg", { exact: true })).toHaveValue("Unsaved local text");
  await expect(page.locator('input[name="expected_updated_at"]')).toHaveValue(version);
  await page.getByRole("button", { name: "Lagre endringer", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "endret av noen andre" })).toBeVisible();
});
