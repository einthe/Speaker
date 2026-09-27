"use server";
import { redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";

export async function signIn(form: FormData) {
  if (!isConfigured()) redirect("/login?error=config");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || password.length > 128) redirect("/login?error=credentials");
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credentials");
  redirect("/matches");
}
export async function signOut() {
  const db = await createClient();
  const { error } = await db.auth.signOut();
  if (error) throw new Error("Kunne ikke logge ut. Prøv igjen.");
  redirect("/login");
}
