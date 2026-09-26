import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Use a disposable local/test Supabase project. The privileged key is test-only,
// never NEXT_PUBLIC_ and never imported by the application.
const enabled = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);
if (process.env.E2E_REQUIRE_BACKEND === "1" && !enabled)
  throw new Error("Authenticated E2E requires test Supabase connection settings.");
test.describe("full authenticated workflow against Supabase", () => {
  test.skip(!enabled, "Requires a disposable Supabase instance; see README.");
  test("registration, approval, role controls, post, event and lineup publication", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const service = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const run = randomUUID().slice(0, 8);
    const password = `Test-${randomUUID()}!`;
    const email = `member-${run}@example.test`;
    const adminEmail = `admin-${run}@example.test`;
    const coachEmail = `coach-${run}@example.test`;
    const makeUser = async (email: string, name: string, role: "player" | "coach" | "admin") => {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error) throw error;
      const updated = await service
        .from("profiles")
        .update({ base_role: role, account_status: "approved" })
        .eq("id", data.user.id);
      if (updated.error) throw updated.error;
      return data.user.id;
    };
    await makeUser(adminEmail, `Admin ${run}`, "admin");
    await makeUser(coachEmail, `Coach ${run}`, "coach");
    const positionCoach = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await positionCoach.auth.signInWithPassword({ email: coachEmail, password });
    if (login.error) throw login.error;
    const starterPositions = [
      "setter",
      "outside_hitter",
      "middle_blocker",
      "opposite",
      "outside_hitter",
      "middle_blocker",
    ];
    for (let i = 0; i < 6; i++) {
      const starter = await makeUser(
        `starter-${i}-${run}@example.test`,
        `Starter ${run} ${i + 1}`,
        "player",
      );
      const assigned = await positionCoach.rpc("set_positions", {
        data: { id: starter, primary: starterPositions[i], secondary: [] },
      });
      if (assigned.error) throw assigned.error;
    }
    await page.goto("/auth/sign-up");
    await page.getByLabel("Fullt navn").fill(`Player ${run}`);
    await page.getByLabel("E-postadresse").fill(email);
    await page.getByLabel("Passord", { exact: true }).fill(password);
    await page.getByLabel("Draktnummer").fill("90");
    await page.getByRole("button", { name: "Opprett konto" }).click();
    await expect(page.getByRole("heading", { name: "Venter på godkjenning" })).toBeVisible();
    const context = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    });
    const admin = await context.newPage();
    await admin.goto(
      `${testInfo.project.use.baseURL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"}/auth/sign-in`,
    );
    await admin.getByLabel("E-postadresse").fill(adminEmail);
    await admin.getByLabel("Passord", { exact: true }).fill(password);
    await admin.getByRole("button", { name: "Logg inn", exact: true }).click();
    await admin.waitForURL("**/feed");
    await admin.goto("/admin/users");
    const request = admin.locator("details.admin-user").filter({ hasText: email });
    await request.locator("summary").first().click();
    await request.getByLabel("Draktnummer").fill("");
    await request.getByRole("button", { name: "Behandle forespørsel" }).click();
    await expect(request.getByRole("status")).toContainText("lagret");
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Nytt innlegg", exact: true }).click();
    await page.getByLabel("Tittel", { exact: true }).fill(`E2E post ${run}`);
    await page.getByLabel("Innlegg", { exact: true }).fill("En melding til laget.");
    await page.getByRole("button", { name: "Publiser innlegg" }).click();
    await expect(page.getByRole("heading", { name: `E2E post ${run}` })).toBeVisible();
    await page.goto("/schedule");
    await expect(page.getByRole("link", { name: "Ny hendelse" })).toHaveCount(0);
    await page.goto("/roster");
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
    await context.close();
    // Separate coach session exercises the graphical starting lineup.
    const coachContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    });
    const coach = await coachContext.newPage();
    await coach.goto("/auth/sign-in");
    await coach.getByLabel("E-postadresse").fill(coachEmail);
    await coach.getByLabel("Passord", { exact: true }).fill(password);
    await coach.getByRole("button", { name: "Logg inn", exact: true }).click();
    await coach.waitForURL("**/feed");
    await coach.goto("/schedule/new");
    await coach.getByLabel("Tittel", { exact: true }).fill(`E2E match ${run}`);
    await coach.getByLabel("Starter", { exact: true }).fill("2027-01-15T18:00");
    await coach.getByLabel("Motstander", { exact: true }).fill("Testmotstander");
    await coach.getByRole("button", { name: "Opprett hendelse" }).click();
    await expect(coach.getByRole("heading", { name: `E2E match ${run}` })).toBeVisible();
    const matchUrl = coach.url();
    await coach.getByRole("link", { name: "Lag kampoppstilling" }).click();
    await expect(
      coach.getByRole("heading", { name: "Kampoppstilling", exact: true }),
    ).toBeVisible();
    await coach.getByLabel("Legger", { exact: true }).selectOption({ label: `Starter ${run} 1` });
    await coach.getByRole("button", { name: "Lagre utkast" }).click();
    await expect(coach.getByRole("link", { name: "Fortsett utkast" })).toBeVisible();
    await page.goto(matchUrl);
    await expect(page.getByText("Oppstillingen er ikke publisert ennå.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Fortsett utkast" })).toHaveCount(0);
    await coach.getByRole("link", { name: "Fortsett utkast" }).click();
    for (let i = 1; i <= 6; i++)
      await coach
        .getByLabel(["Legger", "K1", "M1", "Dia", "K2", "M2"][i - 1], { exact: true })
        .selectOption({ label: `Starter ${run} ${i}` });
    await coach.getByRole("button", { name: "Publiser oppstilling" }).click();
    await expect(coach.getByText("Versjon 2 · Publisert", { exact: false })).toBeVisible();
    await coach.getByRole("link", { name: "Ny versjon" }).click();
    await coach.getByRole("button", { name: "Publiser oppstilling" }).click();
    await expect(coach.getByText("Versjon 3 · Publisert", { exact: false })).toBeVisible();
    await coach.getByText("Tidligere publiserte versjoner", { exact: true }).click();
    await expect(coach.getByRole("heading", { name: "Versjon 2", exact: true })).toBeVisible();
    await coach.getByRole("link", { name: "Rediger hendelse" }).click();
    await coach.getByLabel("Sett vunnet · NTNUI").fill("3");
    await coach.getByLabel("Sett vunnet · motstander").fill("1");
    await coach.getByRole("button", { name: "Lagre endringer" }).click();
    await expect(coach.locator(".score")).toHaveText("3 – 1");
    await page.goto("/feed?filter=lineup");
    await expect(
      page.getByRole("heading", { name: "Klare for Testmotstander" }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/lineup-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await coachContext.close();
    // Test records intentionally remain for inspection. Reset the disposable DB afterward.
  });
});
