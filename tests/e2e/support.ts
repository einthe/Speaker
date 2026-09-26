import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
export async function provision(role: "admin" | "coach" | "player") {
  const service = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const name = `${role} ${randomUUID().slice(0, 8)}`,
    email = `${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}!`;
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
  return { service, id: data.user.id, name, email, password };
}
export async function login(page: Page, account: Awaited<ReturnType<typeof provision>>) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("E-postadresse").fill(account.email);
  await page.getByLabel("Passord", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Innlegg", exact: true })).toBeVisible();
}
export async function postFields(page: Page, title: string) {
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Innlegg", { exact: true }).fill("En beskjed til hele laget.");
}

export async function openNavigation(page: Page) {
  const toggle = page.locator(".mobile-menu-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
    await expect(page.getByRole("dialog", { name: "Navigasjon" })).toBeVisible();
  }
}
