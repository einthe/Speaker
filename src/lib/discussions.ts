import { z } from "zod";

export const discussionTargetSchema = z.object({
  target_type: z.enum(["post", "event"]),
  target_id: z.uuid(),
});
export type DiscussionTarget = z.infer<typeof discussionTargetSchema>;
export const commentSchema = discussionTargetSchema.extend({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  body: z.string().trim().min(1, "Skriv en kommentar.").max(3000, "Bruk høyst 3000 tegn."),
  expected_version: z.number().int().nonnegative().nullable(),
});
export const deleteCommentSchema = discussionTargetSchema.extend({
  id: z.uuid(),
  expected_version: z.number().int().nonnegative(),
});
export const memeCommentSchema = discussionTargetSchema.extend({
  id: z.uuid(),
  parent_id: z.uuid(),
  giphy_id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
});
export const reactionSchema = discussionTargetSchema.extend({
  comment_id: z.uuid().optional(),
  giphy_id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  active: z.boolean(),
});
export type DiscussionComment = {
  id: string;
  parent_id: string | null;
  depth: number;
  author_user_id: string;
  author_name_snapshot: string;
  author_photo_path?: string | null;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  giphy_id?: string | null;
};
export type MemeReaction = {
  id: string;
  author_user_id: string;
  author_name_snapshot: string;
  giphy_id: string;
};
export type DiscussionData = { comments: DiscussionComment[]; reactions: MemeReaction[] };

export type CommentThread = DiscussionComment & { replies: CommentThread[] };
export function commentThreads(comments: DiscussionComment[]): CommentThread[] {
  const nodes = new Map(
    comments.map((comment) => [comment.id, { ...comment, replies: [] } as CommentThread]),
  );
  const roots: CommentThread[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export type DiscussionCounts = { comment_count: number; reaction_count: number };
