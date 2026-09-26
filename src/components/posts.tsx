"use client";
import { eventDateLabel } from "@/lib/event-dates";
import { useState, useId, useContext, type CSSProperties } from "react";
import { TeamContext } from "./team-provider";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  ImagePlus,
  Pencil,
  ShieldCheck,
  MessageSquare,
  Smile,
} from "lucide-react";
import {
  baseRoles,
  roleTone,
  secondaryRoles,
  type Post,
  type Profile,
  type SecondaryRole,
} from "@/lib/domain";
import { dateLabel } from "@/lib/dates";
import { Avatar, Badge } from "./ui";
import { Court } from "./court";
import { ActionForm, DeleteButton, Submit } from "./forms";
import { ImageUpload } from "./image-upload";
import { LinkedText } from "./linked-text";
import { PostGallery } from "./post-gallery";
import { postImages, maxPostImages, maxPostImageMB } from "@/lib/post-media";
import { submitPost } from "@/lib/submit-post";
const InlineDiscussion = dynamic(() => import("./discussion").then((module) => module.Discussion), {
  loading: () => (
    <p className="inline-discussion-loading muted" role="status">
      Laster …
    </p>
  ),
});
export function PostCard({
  post,
  profile,
  detail = false,
  lineup = null,
}: {
  post: Post;
  profile: Profile;
  detail?: boolean;
  lineup?: import("@/lib/domain").Lineup | null;
}) {
  const router = useRouter();
  const discussionId = useId();
  const [section, setSection] = useState<"comments" | "reactions" | null>(null);
  const commentCount = post.discussion_counts?.comment_count ?? 0;
  const reactionCount = post.discussion_counts?.reaction_count ?? 0;
  const responsiveImages = useContext(TeamContext)?.responsiveImages !== false;
  const revision = lineup?.lineup_revisions.find((r) => r.is_current_published);
  const editable =
    profile.base_role === "admin" ||
    (post.post_type === "normal" && profile.id === post.author_user_id);
  const Heading = detail ? "h1" : "h2";
  const media = postImages(post.post_media);
  return (
    <article
      onClick={
        detail
          ? undefined
          : (event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                (event.target as Element).closest(
                  "a,button,input,textarea,select,label,summary,[data-post-interactive]",
                ) ||
                window.getSelection()?.isCollapsed === false
              )
                return;
              if (event.metaKey || event.ctrlKey)
                window.open(`/posts/${post.id}`, "_blank", "noopener,noreferrer");
              else router.push(`/posts/${post.id}`);
            }
      }
      style={
        post.secondary_role_context_key
          ? ({
              "--role-color": `var(--${roleTone[post.secondary_role_context_key]})`,
            } as CSSProperties)
          : post.base_role_snapshot === "coach"
            ? ({ "--role-color": "var(--coach)" } as CSSProperties)
            : undefined
      }
      className={`post-card card ${!detail ? "post-card--linked" : ""} ${post.post_type === "lineup" ? "lineup-post" : ""} ${post.secondary_role_context_key ? "role-post" : post.base_role_snapshot === "coach" ? "coach-post" : ""}`}
    >
      <header className="post-header">
        <Avatar
          name={post.author_name_snapshot}
          userId={post.author_user_id}
          path={post.author_photo_path}
        />
        <div className="post-author">
          <strong>{post.author_name_snapshot}</strong>
          <span>
            {baseRoles[post.base_role_snapshot]} <span className="dot-separator">·</span>{" "}
            <time dateTime={post.created_at}>
              {dateLabel(post.created_at, "d. MMM 'kl.' HH:mm")}
            </time>
            {post.edited_at && <span> · Redigert</span>}
          </span>
        </div>
        {post.secondary_role_context_key && (
          <Badge tone={roleTone[post.secondary_role_context_key]}>
            <ShieldCheck size={12} />
            {post.secondary_role_context_label_snapshot}
          </Badge>
        )}
        {post.post_type === "lineup" && <Badge>Kampoppstilling</Badge>}
      </header>
      <div className="post-content">
        <Heading>
          {detail ? (
            post.title
          ) : (
            <Link href={`/posts/${post.id}`}>
              {post.post_type === "lineup" && lineup
                ? `Klare for ${lineup.schedule_events.match_details?.opponent ?? "kamp"}`
                : post.title}
            </Link>
          )}
        </Heading>
        {post.body && (
          <p className="post-body">
            <LinkedText text={post.body} />
          </p>
        )}
        {lineup && revision && (
          <>
            <p className="lineup-match-meta">
              <CalendarDays size={15} /> {eventDateLabel(lineup.schedule_events)} <span>·</span>{" "}
              {lineup.schedule_events.location}
            </p>
            <Court slots={revision.lineup_revision_slots} compact />
            <Link className="inline-link" href={`/schedule/${lineup.match_event_id}`}>
              Se kampen <ArrowUpRight size={15} />
            </Link>
          </>
        )}
        {media.length > 0 && (
          <PostGallery
            key={media.map((item) => item.id).join(",")}
            images={media}
            title={post.title}
            detail={detail}
            editable={editable}
            responsiveImages={responsiveImages}
          />
        )}
      </div>
      {(!detail || (editable && post.post_type === "normal")) && (
        <footer className="post-footer" data-post-interactive>
          {!detail && (
            <div className="post-discussion-actions">
              <button
                type="button"
                className={`text-button ${commentCount ? "comment-count" : ""}`}
                aria-label={section === "comments" ? "Skjul kommentarer" : "Vis kommentarer"}
                aria-expanded={section === "comments"}
                aria-controls={discussionId}
                onClick={() => setSection(section === "comments" ? null : "comments")}
              >
                <MessageSquare size={15} aria-hidden="true" />
                {commentCount
                  ? `${commentCount} ${commentCount === 1 ? "kommentar" : "kommentarer"}`
                  : "Kommentarer"}
              </button>
              <button
                type="button"
                className={`text-button ${reactionCount ? "meme-count" : ""}`}
                aria-label={section === "reactions" ? "Skjul reaksjoner" : "Vis reaksjoner"}
                aria-expanded={section === "reactions"}
                aria-controls={discussionId}
                onClick={() => setSection(section === "reactions" ? null : "reactions")}
              >
                <Smile size={15} aria-hidden="true" />
                {reactionCount
                  ? `${reactionCount} ${reactionCount === 1 ? "reaksjon" : "reaksjoner"}`
                  : "Reaksjoner"}
              </button>
            </div>
          )}
          {editable && post.post_type === "normal" && (
            <Link href={`/posts/${post.id}/edit`}>
              <Pencil size={14} /> Rediger
            </Link>
          )}
        </footer>
      )}
      {!detail && (
        <div id={discussionId} data-post-interactive hidden={!section}>
          {section && (
            <InlineDiscussion
              target={{ target_type: "post", target_id: post.id }}
              section={section}
              embedded
            />
          )}
        </div>
      )}
      {detail && editable && (
        <div className="post-delete">
          <DeleteButton action="delete-post" id={post.id} label="Slett innlegg" />
        </div>
      )}
    </article>
  );
}
export function PostForm({ post: initialPost, roles }: { post?: Post; roles: SecondaryRole[] }) {
  // Keep the version paired with the editable fields even if a read refreshes.
  const [post] = useState(initialPost);
  const bodyLabel = useId();
  const access = useContext(TeamContext);
  return (
    <ActionForm className="card editor form-stack" submitAction={submitPost}>
      <input type="hidden" name="action" value="post" />
      {post && (
        <>
          <input type="hidden" name="id" value={post.id} />
          <input type="hidden" name="expected_updated_at" value={post.updated_at} />
        </>
      )}
      <label>
        Tittel
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={post?.title}
          placeholder="Hva vil du dele med laget?"
        />
      </label>
      <label>
        <span id={bodyLabel}>Innlegg</span>
        <textarea
          aria-labelledby={bodyLabel}
          name="body"
          required
          maxLength={10000}
          rows={8}
          defaultValue={post?.body}
          placeholder="Skriv innlegget ditt her …"
        />
      </label>
      {!post && roles.length > 0 && (
        <label>
          Publiser som
          <select name="role_context">
            <option value="">Vanlig innlegg</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {secondaryRoles[r]}
              </option>
            ))}
          </select>
          <small className="muted">
            Ansvarsrollen vises på innlegget, også hvis rollen din endres senere.
          </small>
        </label>
      )}
      {postImages(post?.post_media).length < maxPostImages && (
        <fieldset className="upload-field">
          <legend>
            <ImagePlus size={18} /> Legg ved bilder <span className="muted">(valgfritt)</span>
          </legend>
          <ImageUpload
            maxMB={Math.min(maxPostImageMB, access?.imageLimitMB ?? 3)}
            multiple
            maxFiles={maxPostImages - postImages(post?.post_media).length}
          />
          <label>
            Beskriv bildene
            <input
              name="alt_text"
              maxLength={300}
              placeholder="Kort beskrivelse for dem som ikke kan se bildet"
            />
          </label>
        </fieldset>
      )}
      <div className="editor-footer">
        <span className="muted">Synlig for alle godkjente medlemmer.</span>
        <Submit>{post ? "Lagre endringer" : "Publiser innlegg"}</Submit>
      </div>
    </ActionForm>
  );
}
