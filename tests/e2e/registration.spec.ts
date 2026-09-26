import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { login, provision } from "./support";

test.skip(!process.env.E2E_SUPABASE_URL, "Requires a disposable backend.");

for (const role of ["player", "coach"] as const) {
  test(`registration captures ${role} choices for admin approval`, async ({ page }, info) => {
    const admin = await provision("admin");
    const name = `New member ${randomUUID().slice(0, 8)}`;
    const email = `${randomUUID()}@example.test`;
    const password = "New-member-password-123!";
    const { data: jerseys, error } = await admin.service
      .from("player_profiles")
      .select("jersey_number");
    expect(error).toBeNull();
    const jersey = Array.from({ length: 100 }, (_, i) => i).find(
      (n) => !jerseys!.some((p) => p.jersey_number === n),
    )!;
    await page.goto("/auth/sign-up");
    await expect(page.getByRole("checkbox")).toHaveCount(7);
    await expect(page.getByLabel("Kaptein", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Visekaptein", { exact: true })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Rolle", exact: true }).selectOption("coach");
    await expect(page.getByLabel("Draktnummer")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Rolle", exact: true }).selectOption(role);
    if (role === "player") {
      await page.getByLabel("Draktnummer").fill(String(jersey));
      await page.getByLabel("SoMe", { exact: true }).check();
      await page.getByLabel("Botsjef", { exact: true }).check();
    }
    await page.getByLabel("Fullt navn").fill(name);
    await page.getByLabel("E-postadresse").fill(email);
    await page.getByLabel("Passord", { exact: true }).fill(password);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`registration-${role}.png`), fullPage: true });
    await page.getByRole("button", { name: "Opprett konto", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/pending/);
    const signOut = page.getByRole("button", { name: "Logg ut", exact: true });
    await expect(signOut).toHaveClass(/button secondary/);
    const primaryHeight = await page
      .getByRole("link", { name: "Sjekk tilgang" })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(await signOut.evaluate((el) => el.getBoundingClientRect().height)).toBe(primaryHeight);
    await page.screenshot({ path: info.outputPath(`pending-${role}.png`), fullPage: true });
    await page.goto("/fines");
    await expect(page).toHaveURL(/\/auth\/pending/);
    await signOut.click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await login(page, admin);
    await page.goto("/admin/users");
    const account = page.locator("details.admin-user").filter({ hasText: email });
    await account.locator("summary").first().click();
    await expect(account.getByRole("combobox", { name: "Grunnrolle" })).toHaveValue(role);
    if (role === "player") {
      await expect(account.getByLabel("Draktnummer")).toHaveValue(String(jersey));
      await expect(account.getByLabel("SoMe", { exact: true })).toBeChecked();
      await expect(account.getByLabel("Botsjef", { exact: true })).toBeChecked();
      await expect(account.getByLabel("Kaptein", { exact: true })).not.toBeChecked();
    } else {
      await expect(account.getByLabel("Draktnummer")).toHaveCount(0);
    }
    await account.getByRole("button", { name: "Behandle forespørsel", exact: true }).click();
    await expect(account.getByRole("status")).toContainText("lagret");
    const { data: profile } = await admin.service
      .from("profiles")
      .select("base_role,account_status")
      .eq("full_name", name)
      .single();
    expect(profile).toEqual({ base_role: role, account_status: "approved" });
  });
}
