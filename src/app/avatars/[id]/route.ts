import { getAccount } from "@/server/queries";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import { imageWidth } from "@/lib/image-variants";
import { imageError, privateImageResponse } from "@/server/private-images";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAccount();
  if (profile?.account_status !== "approved") return imageError(403);
  const { id } = await params;
  if (!uuid.safeParse(id).success) return imageError(404);
  const query = new URL(request.url).searchParams;
  const width = imageWidth("avatar", query.get("w"));
  if (width === null) return imageError(400);
  const db = await createClient({ cache: "no-store" });
  const { data } = await db
    .from("profile_photos")
    .select("storage_path")
    .eq("user_id", id)
    .maybeSingle();
  if (!data) return imageError(404);
  if (query.has("v") && query.get("v") !== data.storage_path) return imageError(404);
  return privateImageResponse(request, db, "avatar", data.storage_path, width, profile.id);
}
