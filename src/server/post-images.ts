"use server";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "./queries";
import { imageSchema, uuid } from "@/lib/domain";
import { maxPostImageMB } from "@/lib/post-media";
import { warmImageVariants } from "./private-images";

export async function uploadPostImage(form: FormData): Promise<{ error?: string }> {
  const profile = await requireAccount();
  const db = await createClient({ cache: "no-store" });
  const id = uuid.parse(form.get("post_id"));
  const { data: post } = await db
    .from("posts")
    .select("author_user_id,post_type")
    .eq("id", id)
    .single();
  if (
    !post ||
    post.post_type !== "normal" ||
    (post.author_user_id !== profile.id && profile.base_role !== "admin")
  )
    return { error: "Du har ikke tilgang til å legge til bilder her." };
  const file = form.get("image");
  const limit = Math.min(maxPostImageMB, Math.max(1, Number(process.env.MAX_IMAGE_SIZE_MB) || 3));
  if (
    !(file instanceof File) ||
    !imageSchema.safeParse({ type: file.type, size: file.size }).success
  )
    return { error: "Velg et gyldig JPEG-, PNG- eller WebP-bilde." };
  if (file.size > limit * 1024 * 1024) return { error: `Hvert bilde kan være høyst ${limit} MB.` };
  const alt = String(form.get("alt_text") ?? "");
  if (alt.length > 300) return { error: "Bildebeskrivelsen kan være høyst 300 tegn." };
  const source = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(id).update(source).digest("hex");
  const imageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  const path = `${profile.id}/${imageId}.webp`;
  // Retrying after an interrupted response must not add the same photo twice.
  const { data: existing, error: lookupError } = await db
    .from("post_media")
    .select("id")
    .eq("post_id", id)
    .eq("storage_path", path)
    .maybeSingle();
  if (lookupError) return { error: "Bildene kunne ikke hentes. Prøv igjen." };
  if (existing) return {};
  let buffer: Buffer;
  let width: number;
  let height: number;
  try {
    const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("invalid_image");
    const processed = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    buffer = processed.data;
    width = processed.info.width;
    height = processed.info.height;
  } catch {
    return { error: "Velg et gyldig JPEG-, PNG- eller WebP-bilde." };
  }
  const uploaded = await db.storage.from("post-images").upload(path, buffer, {
    contentType: "image/webp",
    upsert: false,
  });
  // A previous attempt may have uploaded the bytes before its response was lost.
  if (uploaded.error) {
    const existingFile = await db.storage.from("post-images").info(path);
    if (existingFile.error || !existingFile.data)
      return { error: "Bildet kunne ikke lastes opp. Prøv igjen." };
  }
  const { error } = await db.rpc("attach_media", {
    data: {
      post_id: id,
      storage_path: path,
      mime_type: "image/webp",
      size_bytes: buffer.length,
      alt_text: alt,
      width,
      height,
    },
  });
  if (error) {
    // A concurrent retry may already have attached this path; never delete its image.
    const { data: attached, error: checkError } = await db
      .from("post_media")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (attached) return {};
    if (!checkError) await db.storage.from("post-images").remove([path]);
    return {
      error: error.message.includes("too_many_post_images")
        ? "Et innlegg kan ha høyst 10 bilder."
        : "Bildet kunne ikke knyttes til innlegget. Prøv igjen.",
    };
  }
  if (!uploaded.error) await warmImageVariants(db, "post", path, buffer);
  return {};
}
