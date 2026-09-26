"use server";
import { scheduleNotificationEmails } from "./notifications/schedule";
import { z } from "zod";
import {
  commentSchema,
  deleteCommentSchema,
  reactionSchema,
  memeCommentSchema,
} from "@/lib/discussions";
import { requireAccount } from "@/server/queries";
import { createClient } from "@/lib/supabase/server";

export async function updateDiscussion(
  action: "comment" | "delete" | "reaction" | "meme",
  input: unknown,
): Promise<{ error?: string }> {
  await requireAccount();
  try {
    const data =
      action === "meme"
        ? memeCommentSchema.parse(input)
        : action === "comment"
          ? commentSchema.parse(input)
          : action === "delete"
            ? deleteCommentSchema.parse(input)
            : action === "reaction"
              ? reactionSchema.parse(input)
              : null;
    if (!data) return { error: "Ugyldig handling." };
    const db = await createClient();
    const result = await db.rpc(
      action === "comment" || action === "meme"
        ? "save_comment"
        : action === "delete"
          ? "delete_comment"
          : "comment_id" in data && data.comment_id
            ? "set_comment_meme_reaction"
            : "set_meme_reaction",
      { data },
    );
    if (result.error) {
      if (result.error.message.includes("stale_"))
        return { error: "Kommentaren ble endret. Oppdater siden før du prøver igjen." };
      if (result.error.message.includes("not_authorized"))
        return { error: "Du har ikke tilgang til denne handlingen." };
      if (result.error.message.includes("thread_too_deep"))
        return { error: "Svar på en tidligere kommentar i tråden." };
      return { error: "Kunne ikke lagre. Prøv igjen." };
    }
    if (action !== "delete") scheduleNotificationEmails();
    return {};
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError ? error.issues[0].message : "Kunne ikke lagre. Prøv igjen.",
    };
  }
}
