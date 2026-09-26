import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ImageSettings } from "@/lib/cache/contract";

export async function getImageSettings(): Promise<ImageSettings> {
  const db = await createClient({ cache: "no-store" });
  const { data, error } = await db
    .from("image_settings")
    .select("responsive_images,version")
    .eq("id", true)
    .single();
  if (error) throw new Error("Bildeinnstillingene kunne ikke hentes.");
  return data;
}

export async function getResponsiveImages() {
  try {
    return (await getImageSettings()).responsive_images;
  } catch {
    // Keep the app usable during rollout before the settings migration is applied.
    return true;
  }
}
