import { mutate } from "@/server/actions";
import { uploadPostImage } from "@/server/post-images";
import type { ActionState } from "@/server/auth-actions";
import { maxPostImages, maxPostImageMB } from "./post-media";

export async function submitPost(previous: ActionState, form: FormData): Promise<ActionState> {
  const files = form
    .getAll("image")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > maxPostImages) return { ...previous, error: "Velg høyst 10 bilder." };
  if (files.some((file) => file.size > maxPostImageMB * 1024 * 1024))
    return { ...previous, error: "Hvert bilde kan være høyst 3 MB." };
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type)))
    return { ...previous, error: "Velg JPEG-, PNG- eller WebP-bilder." };
  const text = new FormData();
  for (const [key, value] of form) if (key !== "image") text.append(key, value);
  const saved = await mutate(previous, text);
  if (saved.error || !saved.savedPostId) return saved;
  for (const file of files) {
    const image = new FormData();
    image.set("post_id", saved.savedPostId);
    image.set("image", file);
    image.set("alt_text", String(form.get("alt_text") ?? ""));
    let error: string | undefined;
    try {
      error = (await uploadPostImage(image)).error;
    } catch {
      error = "Opplastingen ble avbrutt. Prøv igjen.";
    }
    if (error)
      return {
        savedPostId: saved.savedPostId,
        savedPostUpdatedAt: saved.savedPostUpdatedAt,
        change: saved.change,
        error: `Teksten er lagret. Eventuelle ferdige bilder er også lagret. ${error}`,
      };
  }
  return saved;
}
