import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient, isConfigured } from "@/lib/supabase/server";

export async function requireUser() {
  await connection();
  if (!isConfigured()) redirect("/login");
  const db = await createClient({ cache: "no-store" });
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await db
    .from("profiles")
    .select("id,account_status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.account_status !== "approved") redirect("/login?error=access");
  return user;
}
