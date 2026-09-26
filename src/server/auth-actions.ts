"use server";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { registrationSchema } from "@/lib/domain";
export type ActionState = {
  error?: string;
  destination?: string;
  change?: import("@/lib/cache/contract").Change;
  success?: string;
  savedPostId?: string;
  savedPostUpdatedAt?: string;
};
export async function authAction(_state: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfigured())
    return { error: "Tjenesten er ikke konfigurert ennå. Kontakt administrator." };
  const mode = String(form.get("mode"));
  const db = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (mode === "sign-up") {
    const input = registrationSchema.safeParse({
      email,
      password,
      full_name: form.get("full_name"),
      base_role: form.get("base_role"),
      jersey_number:
        String(form.get("jersey_number") ?? "").trim() === ""
          ? undefined
          : Number(form.get("jersey_number")),
      roles: form.getAll("roles"),
    });
    if (!input.success) return { error: input.error.issues[0].message };
    const { error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: input.data.full_name,
          registration: {
            base_role: input.data.base_role,
            jersey_number: input.data.base_role === "player" ? input.data.jersey_number : null,
            roles: input.data.base_role === "player" ? input.data.roles : [],
          },
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    if (error)
      return {
        error:
          "Kunne ikke opprette kontoen. Prøv igjen, eller logg inn hvis du allerede har en konto.",
      };
    return { destination: "/auth/pending?registered=1" };
  }
  if (mode === "recover") {
    if (!z.email().safeParse(email).success) return { error: "Skriv en gyldig e-postadresse." };
    await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/update-password`,
    });
    return {
      success: "Hvis adressen har en konto, får du en e-post med en lenke for å endre passordet.",
    };
  }
  if (mode === "update-password") {
    if (password.length < 12 || password.length > 128)
      return { error: "Passordet må ha mellom 12 og 128 tegn." };
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { error: "Lenken er utløpt. Be om en ny lenke." };
    const { error } = await db.auth.updateUser({ password });
    if (error) return { error: "Kunne ikke endre passordet. Be om en ny lenke og prøv igjen." };
    return { destination: "/feed" };
  }
  if (mode !== "sign-in" || !z.email().safeParse(email).success || password.length > 128)
    return { error: "Kontroller e-post og passord." };
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error)
    return {
      error: "Kunne ikke logge inn. Kontroller e-post og passord, og bekreft e-postadressen din.",
    };
  return { destination: "/feed" };
}
export async function signOut(): Promise<ActionState> {
  if (isConfigured()) {
    const db = await createClient();
    const { error } = await db.auth.signOut();
    if (error) return { error: "Kunne ikke logge ut. Prøv igjen." };
  }
  return { destination: "/auth/sign-in" };
}
