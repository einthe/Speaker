import { MessageSquare, Smile } from "lucide-react";
import type { DiscussionCounts as Counts } from "@/lib/discussions";

export function DiscussionCounts({ counts }: { counts?: Counts }) {
  if (!counts || (!counts.comment_count && !counts.reaction_count)) return null;
  return (
    <div className="discussion-counts">
      {counts.comment_count > 0 && (
        <span className="comment-count">
          <MessageSquare size={14} aria-hidden="true" />
          {counts.comment_count} {counts.comment_count === 1 ? "kommentar" : "kommentarer"}
        </span>
      )}
      {counts.reaction_count > 0 && (
        <span className="meme-count">
          <Smile size={14} aria-hidden="true" />
          {counts.reaction_count} {counts.reaction_count === 1 ? "reaksjon" : "reaksjoner"}
        </span>
      )}
    </div>
  );
}
