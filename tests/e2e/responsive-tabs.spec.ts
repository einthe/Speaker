import { test, expect } from "@playwright/test";
import { login, postFields, provision } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable backend.");

test("feed tabs respond before network results, handle rapid clicks and preserve browser history", async ({
  page,
}) => {
  const account = await provision("player");
  await login(page, account);
  await page.goto("/posts/new");
  const title = `Raske faner ${account.name}`;
  await postFields(page, title);
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Filtrer innlegg" });
  const all = tabs.getByRole("link", { name: "Alle innlegg", exact: true });
  const roles = tabs.getByRole("link", { name: "Fra ansvarsroller", exact: true });
  const lineups = tabs.getByRole("link", { name: "Kampoppstillinger", exact: true });
  let releaseRoles = () => {};
  let releaseLineups = () => {};
  const heldRoles = new Promise<void>((resolve) => {
    releaseRoles = resolve;
  });
  const heldLineups = new Promise<void>((resolve) => {
    releaseLineups = resolve;
  });
  const requests: string[] = [];
  let routeRequests = 0;
  await page.route("**/feed?**", async (route) => {
    if (route.request().headers().rsc === "1") {
      if (route.request().headers()["next-router-prefetch"] !== "1") routeRequests++;
      await heldRoles;
    }
    await route.continue().catch(() => {});
  });
  await page.route("**/api/team/posts?**", async (route) => {
    const filter = new URL(route.request().url()).searchParams.get("filter");
    if (filter === "roles" || filter === "lineup") {
      requests.push(filter);
      await (filter === "roles" ? heldRoles : heldLineups);
    }
    // Rapid tab changes intentionally abort superseded reads.
    await route.continue().catch(() => {});
  });
  try {
    const history = await page.evaluate(() => window.history.length);
    await roles.click();
    await expect(roles).toHaveAttribute("aria-current", "page", { timeout: 1000 });
    await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toBeVisible();
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await lineups.click();
    await expect(lineups).toHaveClass("selected", { timeout: 1000 });
    await all.click();
    await expect(all).toHaveAttribute("aria-current", "page", { timeout: 1000 });
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(routeRequests).toBe(0);
    expect(await page.evaluate(() => window.history.length)).toBe(history + 3);
    await all.click();
    expect(await page.evaluate(() => window.history.length)).toBe(history + 3);
    await page.goBack();
    await expect(lineups).toHaveAttribute("aria-current", "page");
    releaseLineups();
    await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toHaveCount(0);
    await page.goBack();
    await expect(roles).toHaveAttribute("aria-current", "page");
    releaseRoles();
    await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toHaveCount(0);
    await page.goForward();
    await expect(lineups).toHaveAttribute("aria-current", "page");
    expect(requests).toContain("roles");
    expect(requests).toContain("lineup");
    await roles.focus();
    await page.keyboard.press("Enter");
    await expect(roles).toHaveAttribute("aria-current", "page");
    await expect(roles).toBeFocused();
    await page.reload();
    await expect(roles).toHaveAttribute("aria-current", "page");
    expect(page.url()).toMatch(/\/feed\?filter=roles$/);
  } finally {
    releaseRoles();
    releaseLineups();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("schedule, lineup and fine tabs stay interactive while their results load", async ({
  page,
}) => {
  await login(page, await provision("coach"));
  for (const [path, name, previous, next] of [
    ["/schedule", "Tidsperiode", "Kommende", "Tidligere"],
    ["/lineups/new", "Velg kamper", "Kommende kamper", "Tidligere kamper"],
    ["/fines", "Bøter", "Bøtetabell", "Bøter"],
  ]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name, exact: true });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toHaveCount(0);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let routeRequests = 0;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === path && route.request().headers().rsc === "1") {
        if (route.request().headers()["next-router-prefetch"] !== "1") routeRequests++;
        await held;
      } else if (url.pathname === "/api/team/events") await held;
      await route.continue().catch(() => {});
    });
    try {
      await nav.getByRole("link", { name: next, exact: true }).click();
      await expect(nav.getByRole("link", { name: next, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
        { timeout: 1000 },
      );
      if (path !== "/fines")
        await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toBeVisible();
      await nav.getByRole("link", { name: previous, exact: true }).click();
      await expect(nav.getByRole("link", { name: previous, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      if (path === "/schedule") {
        await page.getByLabel("Type hendelse", { exact: true }).selectOption("match");
        await expect(page.getByLabel("Type hendelse", { exact: true })).toHaveValue("match");
        await expect(page).toHaveURL(/type=match/);
      }
      expect(routeRequests).toBe(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  }
});

test("switching a cached filter still checks stale account access", async ({ page }) => {
  const account = await provision("player");
  await login(page, account);
  const tabs = page.getByRole("navigation", { name: "Filtrer innlegg" });
  await tabs.getByRole("link", { name: "Fra ansvarsroller" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Laster inn" })).toHaveCount(0);
  await tabs.getByRole("link", { name: "Alle innlegg" }).click();
  await page.clock.install();
  await page.clock.fastForward(16_000);
  const changed = await account.service
    .from("profiles")
    .update({ account_status: "disabled" })
    .eq("id", account.id);
  expect(changed.error).toBeNull();
  await tabs.getByRole("link", { name: "Fra ansvarsroller" }).click();
  await expect(page).toHaveURL(/\/auth\/rejected$/);
});
