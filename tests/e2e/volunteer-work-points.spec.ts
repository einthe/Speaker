import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { login, openNavigation, provision } from "./support";

async function adminClient() {
  const admin = await provision("admin");
  const client = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const session = await client.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  if (session.error) throw session.error;
  return client;
}

test("volunteer points are private", async ({ request }) => {
  expect((await request.get("/api/team/volunteer_work_points")).status()).toBe(401);
});

test("players see all players including zero totals, sorted by points, with their own row highlighted", async ({
  page,
}) => {
  const player = await provision("player");
  const leader = await provision("player");
  const coach = await provision("coach");
  const admin = await adminClient();
  const seeded = await admin.rpc("set_volunteer_work_points", {
    data: { id: leader.id, points: 9999, expected_version: 0 },
  });
  if (seeded.error) throw seeded.error;
  await login(page, player);
  await openNavigation(page);
  await page.getByRole("link", { name: "Dugnadspoeng", exact: true }).click();
  await expect(page).toHaveURL(/\/volunteer_work_points$/);
  await expect(page.getByRole("heading", { name: "Dugnadspoeng", exact: true })).toBeVisible();
  const own = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: `${player.name} (deg)`, exact: true }) });
  await expect(own).toHaveClass(/standings-team-highlight/);
  await expect(own.getByRole("cell").last()).toHaveText("0");
  const rows = page.locator("tbody tr");
  const points = await rows.evaluateAll((rows) =>
    rows.map((row) => Number(row.lastElementChild?.textContent?.replace(/\s/g, ""))),
  );
  expect(points).toEqual([...points].sort((a, b) => b - a));
  await expect(page.getByRole("rowheader", { name: leader.name, exact: true })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: coach.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/volunteer-points-${test.info().project.name}.png`,
    fullPage: true,
  });
});

for (const role of ["admin", "coordinator"] as const) {
  test(`${role} can change another player's points and the new order persists`, async ({
    page,
  }) => {
    const editor = await provision(role === "admin" ? "admin" : "player");
    const player = await provision("player");
    if (role === "coordinator") {
      const admin = await adminClient();
      const grant = await admin.rpc("manage_user", {
        data: {
          id: editor.id,
          full_name: editor.name,
          base_role: "player",
          account_status: "approved",
          jersey_number: null,
          roles: ["volunteer_work_coordinator"],
        },
      });
      if (grant.error) throw grant.error;
    }
    await login(page, editor);
    await page.goto("/volunteer_work_points");
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: player.name, exact: true }) });
    for (const points of [24, 6]) {
      await row.getByRole("spinbutton").fill(String(points));
      const saved = page.waitForResponse(
        (r) =>
          r.url().includes("/api/team/volunteer_work_points") && r.request().method() === "GET",
      );
      await row.getByRole("button", { name: "Lagre", exact: true }).click();
      const response = await saved;
      const { data } = await response.json();
      expect(data.find((p: { id: string }) => p.id === player.id).points).toBe(points);
      expect(data.map((p: { points: number }) => p.points)).toEqual(
        data.map((p: { points: number }) => p.points).sort((a: number, b: number) => b - a),
      );
    }
    await page.reload();
    await expect(row.getByRole("spinbutton")).toHaveValue("6");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/volunteer-points-${role}-${test.info().project.name}.png`,
      fullPage: true,
    });
  });
  test(`${role} assigns volunteers using ascending points and preserves selections when editing`, async ({
    page,
  }) => {
    const editor = await provision(role === "admin" ? "admin" : "player");
    const low = await provision("player");
    const high = await provision("player");
    const zero = await provision("player");
    const admin = await adminClient();
    if (role === "coordinator") {
      const grant = await admin.rpc("manage_user", {
        data: {
          id: editor.id,
          full_name: editor.name,
          base_role: "player",
          account_status: "approved",
          jersey_number: null,
          roles: ["volunteer_work_coordinator"],
        },
      });
      if (grant.error) throw grant.error;
    }
    for (const [player, points] of [
      [low, 3],
      [high, 40],
    ] as const) {
      const result = await admin.rpc("set_volunteer_work_points", {
        data: { id: player.id, points, expected_version: 0 },
      });
      if (result.error) throw result.error;
    }
    await login(page, editor);
    if (role === "admin")
      await page.route("**/api/team/volunteer_work_points?*", (route) =>
        route.fulfill({ status: 503, json: { error: "Unavailable" } }),
      );
    await page.goto("/schedule/new");
    await page.getByLabel("Type hendelse").selectOption("volunteer_work");
    const title = `Dugnad ${low.name}`;
    await page.getByLabel("Tittel", { exact: true }).fill(title);
    await page.getByLabel("Starter", { exact: true }).fill("2030-05-10T18:00");
    if (role === "admin") {
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Dugnadspoengene kunne ikke hentes",
      );
      await expect(
        page.getByRole("button", { name: "Opprett hendelse", exact: true }),
      ).toBeDisabled();
      await page.unroute("**/api/team/volunteer_work_points?*");
      await page.getByRole("button", { name: "Prøv igjen", exact: true }).click();
      await expect(page).toHaveURL(/\/schedule\/new$/);
      await expect(page.getByLabel("Tittel", { exact: true })).toHaveValue(title);
    }
    const list = page.locator(".volunteer-assignment-list");
    const lowRow = list.locator("label").filter({ hasText: low.name });
    const highRow = list.locator("label").filter({ hasText: high.name });
    await expect(lowRow).toContainText("3 poeng");
    await expect(highRow).toContainText("40 poeng");
    await expect(list.locator("label").filter({ hasText: zero.name })).toContainText("0 poeng");
    const totals = await list
      .locator(".assignment-points")
      .evaluateAll((nodes) =>
        nodes.map((node) => Number(node.textContent?.replace(/[^0-9]/g, ""))),
      );
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    await lowRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Opprett hendelse", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator(".assignments")).toContainText(low.name);
    await expect(page.locator(".assignments")).not.toContainText(high.name);
    await page.getByRole("link", { name: "Rediger hendelse", exact: true }).click();
    await expect(lowRow.getByRole("checkbox")).toBeChecked();
    await expect(highRow.getByRole("checkbox")).not.toBeChecked();
    await highRow.getByRole("checkbox").check();
    await page.screenshot({
      path: `test-results/volunteer-assignments-${role}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Lagre endringer", exact: true }).click();
    await expect(page.locator(".assignments")).toContainText(low.name);
    await expect(page.locator(".assignments")).toContainText(high.name);
  });
}
