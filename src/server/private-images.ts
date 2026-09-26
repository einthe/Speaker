import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache, updateTag } from "next/cache";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imageWidths, type ImageKind } from "@/lib/image-variants";

// Increment when the encoding settings change; old variants must not be reused.
const encodingVersion = "private-webp-v1";
const buckets = { avatar: "profile-photos", post: "post-images" } as const;
function imageCacheTag(kind: ImageKind, path: string) {
  return `private-image-${createHash("sha256")
    .update(JSON.stringify([process.env.NEXT_PUBLIC_SUPABASE_URL, kind, path]))
    .digest("hex")}`;
}

export function forgetImageVariants(kind: ImageKind, path: string) {
  updateTag(imageCacheTag(kind, path));
}
export const privateImageHeaders = {
  "Cache-Control": "private, no-cache, must-revalidate",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};

export function imageError(status: number) {
  return new Response(null, {
    status,
    headers: { ...privateImageHeaders, "Cache-Control": "private, no-store" },
  });
}

export async function encodeImage(source: Buffer, kind: ImageKind, width: number) {
  if (source.length > 10 * 1024 * 1024) throw new Error("invalid_image");
  const pipeline = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await pipeline.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("invalid_image");
  return pipeline
    .resize(
      kind === "avatar"
        ? { width, height: width, fit: "cover" }
        : { width, height: width, fit: "inside", withoutEnlargement: true },
    )
    .webp({ quality: 85 })
    .toBuffer();
}

async function sourceVersion(db: SupabaseClient, kind: ImageKind, path: string) {
  // Live Storage authorization/existence check, never part of the derived-byte cache.
  const { data, error } = await db.storage.from(buckets[kind]).info(path);
  if (error || !data) return null;
  if (!data.version && !data.etag && !data.lastModified) return null;
  return JSON.stringify([data.id, data.version, data.etag, data.lastModified]);
}

async function variant(
  db: SupabaseClient,
  kind: ImageKind,
  path: string,
  version: string,
  width: number,
  uploadedSource?: Buffer,
) {
  let generated: string | undefined;
  let generationFailed = false;
  const generate = async () => {
    try {
      let source = uploadedSource;
      if (!source) {
        const file = await db.storage.from(buckets[kind]).download(
          path,
          {
            cacheNonce: createHash("sha256").update(version).digest("hex"),
          },
          { cache: "no-store" },
        );
        if (file.error) throw new Error("image_unavailable");
        source = Buffer.from(await file.data.arrayBuffer());
      }
      const image = await encodeImage(source, kind, width);
      // Do not cache bytes under an obsolete version if the source changed mid-request.
      if ((await sourceVersion(db, kind, path)) !== version) throw new Error("image_changed");
      generated = image.toString("base64");
      // Leave room for the cache envelope under hosts' common 2 MB entry limit.
      if (generated.length > 1_800_000) throw new Error("image_cache_entry_too_large");
      return generated;
    } catch (error) {
      generationFailed = true;
      throw error;
    }
  };
  const cached = unstable_cache(
    generate,
    [encodingVersion, process.env.NEXT_PUBLIC_SUPABASE_URL!, kind, path, version, String(width)],
    { revalidate: false, tags: [imageCacheTag(kind, path)] },
  );
  try {
    return Buffer.from(await cached(), "base64");
  } catch (error) {
    // Cache outages/entry size limits must not prevent an otherwise valid image loading.
    if (generated !== undefined) return Buffer.from(generated, "base64");
    if (generationFailed) throw error;
    try {
      return Buffer.from(await generate(), "base64");
    } catch (generationError) {
      if (generated !== undefined) return Buffer.from(generated, "base64");
      throw generationError;
    }
  }
}

export async function warmImageVariants(
  db: SupabaseClient,
  kind: ImageKind,
  path: string,
  source: Buffer,
) {
  // Optimization is best effort; a cache failure must not roll back a valid upload.
  try {
    const version = await sourceVersion(db, kind, path);
    if (!version) return;
    await Promise.all(
      imageWidths[kind].map((width) => variant(db, kind, path, version, width, source)),
    );
  } catch {
    // Existing/direct uploads and cold caches use the same validated path on first view.
  }
}

export async function privateImageResponse(
  request: Request,
  db: SupabaseClient,
  kind: ImageKind,
  path: string,
  width: number,
  viewerId: string,
) {
  const version = await sourceVersion(db, kind, path);
  if (!version) return imageError(404);
  try {
    const image = await variant(db, kind, path, version, width);
    const etag = `"${createHash("sha256").update(viewerId).update(image).digest("hex")}"`;
    const headers = { ...privateImageHeaders, ETag: etag, "Content-Type": "image/webp" };
    const matches = request.headers
      .get("if-none-match")
      ?.split(",")
      .some((value) => {
        const tag = value.trim().replace(/^W\//, "");
        return tag === etag || tag === "*";
      });
    return new Response(matches ? null : new Uint8Array(image), {
      status: matches ? 304 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "image_unavailable") return imageError(404);
    if (error instanceof Error && error.message === "image_changed") return imageError(409);
    return imageError(415);
  }
}
