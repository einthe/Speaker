"use client";
import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys, queries } from "@/lib/cache/queries";
import {
  commentThreads,
  type CommentThread,
  type DiscussionTarget,
  type MemeReaction,
} from "@/lib/discussions";
import { updateDiscussion } from "@/server/discussion-actions";
import { dateLabel } from "@/lib/dates";
import { useTeam } from "./team-provider";
import { QueryState } from "./query-state";
import { LinkedText } from "./linked-text";
import { Avatar } from "./avatar";
import { GiphyReactions, GiphyPicker, ThreadMeme } from "./giphy-reactions";
import { giphyConfigured } from "@/lib/giphy";

type Save = (
  action: "comment" | "delete" | "reaction" | "meme",
  data: Record<string, unknown>,
) => Promise<{ error?: string }>;
export function Discussion({
  target,
  section = "all",
  embedded = false,
}: {
  target: DiscussionTarget;
  section?: "all" | "comments" | "reactions";
  embedded?: boolean;
}) {
  const commentsTitle = useId();
  const composerId = useId();
  const composerButton = useRef<HTMLButtonElement>(null);
  const [writing, setWriting] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(true);
  const threadId = useId();
  const { scope, profile } = useTeam();
  const client = useQueryClient();
  const options = queries.discussion(scope, target);
  const query = useQuery(options);
  const [visible, setVisible] = useState(20);
  const save: Save = async (action, data) => {
    try {
      const result = await updateDiscussion(action, { ...data, ...target });
      if (!result.error)
        await Promise.all([
          client.invalidateQueries({ queryKey: options.queryKey }),
          client.invalidateQueries({
            queryKey: target.target_type === "post" ? keys.posts(scope) : keys.events(scope),
          }),
        ]);
      return result;
    } catch {
      return { error: "Kunne ikke lagre. Kontroller forbindelsen og prøv igjen." };
    }
  };
  return (
    <div
      className={embedded ? "discussion discussion-inline" : "card discussion"}
      aria-label="Kommentarer og reaksjoner"
    >
      <QueryState query={query} title="Diskusjonen kunne ikke hentes">
        {(data) => (
          <>
            {section !== "comments" && (
              <DiscussionReactions
                save={save}
                collapsible={!embedded}
                reactions={data.reactions}
                userId={profile.id}
              />
            )}
            {section !== "reactions" && (
              <section className="discussion-comments" aria-labelledby={commentsTitle}>
                <div className="section-title">
                  <h2 id={commentsTitle}>
                    Kommentarer{" "}
                    <span className="muted">
                      (
                      {
                        data.comments.filter((comment) => !comment.deleted_at && !comment.giphy_id)
                          .length
                      }
                      )
                    </span>
                  </h2>
                  {!embedded && (
                    <button
                      type="button"
                      className="text-button"
                      aria-expanded={commentsExpanded}
                      aria-controls={threadId}
                      onClick={() => setCommentsExpanded((value) => !value)}
                    >
                      {commentsExpanded ? "Skjul alle kommentarer" : "Vis alle kommentarer"}
                    </button>
                  )}
                  {commentsExpanded && (
                    <button
                      type="button"
                      className="button secondary"
                      ref={composerButton}
                      aria-expanded={writing}
                      aria-controls={composerId}
                      onClick={() => setWriting((value) => !value)}
                    >
                      {writing ? "Skjul skrivefelt" : "Skriv kommentar"}
                    </button>
                  )}
                </div>
                <div id={threadId} hidden={!commentsExpanded}>
                  {commentsExpanded && (
                    <>
                      <div id={composerId} hidden={!writing}>
                        {writing && (
                          <CommentForm
                            save={save}
                            autoFocus
                            onDone={() => {
                              setWriting(false);
                              composerButton.current?.focus();
                            }}
                            label={
                              target.target_type === "post"
                                ? "Kommenter innlegget"
                                : "Kommenter hendelsen"
                            }
                          />
                        )}
                      </div>
                      {!data.comments.length && <p className="muted">Ingen kommentarer ennå.</p>}
                      <ol className="comment-threads">
                        {commentThreads(data.comments)
                          .slice(0, visible)
                          .map((comment) => (
                            <Comment
                              key={comment.id}
                              comment={comment}
                              save={save}
                              userId={profile.id}
                              admin={profile.base_role === "admin"}
                            />
                          ))}
                      </ol>
                      {commentThreads(data.comments).length > visible && (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setVisible((n) => n + 20)}
                        >
                          Vis flere kommentarer
                        </button>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
function DiscussionReactions({
  save,
  reactions,
  userId,
  collapsible = true,
}: {
  save: Save;
  reactions: MemeReaction[];
  userId: string;
  collapsible?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <GiphyReactions
        reactions={reactions}
        userId={userId}
        collapsible={collapsible}
        busy={busy}
        reactTo={async (id, active) => {
          if (lock.current) return false;
          lock.current = true;
          setBusy(true);
          setError(undefined);
          try {
            const result = await save("reaction", {
              giphy_id: id,
              active,
            });
            setError(result.error);
            return !result.error;
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      />
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
function CommentForm({
  save,
  label,
  parent,
  edit,
  onDone,
  autoFocus = false,
}: {
  save: Save;
  label: string;
  parent?: string;
  edit?: CommentThread;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const fieldId = useId();
  const [body, setBody] = useState(edit?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  const lock = useRef(false);
  return (
    <form
      className="comment-form"
      aria-label={label}
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        setSaved(false);
        requestId.current ??= crypto.randomUUID();
        try {
          const result = await save("comment", {
            id: edit?.id ?? requestId.current,
            parent_id: parent ?? null,
            body,
            expected_version: edit?.version ?? null,
          });
          if (result.error) setError(result.error);
          else {
            setBody("");
            requestId.current = null;
            setSaved(true);
            onDone?.();
          }
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <label htmlFor={fieldId}>{label}</label>
      <textarea
        autoFocus={autoFocus}
        id={fieldId}
        value={body}
        required
        maxLength={3000}
        rows={3}
        disabled={busy}
        onChange={(event) => {
          setBody(event.target.value);
          setSaved(false);
        }}
      />
      <div className="comment-actions">
        <button type="submit" className="button" disabled={busy || !body.trim()}>
          {busy
            ? "Lagrer …"
            : edit
              ? "Lagre kommentar"
              : parent
                ? "Publiser svar"
                : "Publiser kommentar"}
        </button>
        {onDone && (
          <button type="button" className="text-button" disabled={busy} onClick={onDone}>
            Avbryt
          </button>
        )}
        <small className="muted">{body.length}/3000</small>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {saved && !onDone && (
        <p className="field-hint" role="status">
          Kommentaren er publisert.
        </p>
      )}
    </form>
  );
}
function Comment({
  comment,
  save,
  userId,
  admin,
}: {
  comment: CommentThread;
  save: Save;
  userId: string;
  admin: boolean;
}) {
  const [mode, setMode] = useState<"reply" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const own = comment.author_user_id === userId;
  const [picker, setPicker] = useState(false);
  const memeRequest = useRef<{ gif: string; id: string } | null>(null);
  const memeLock = useRef(false);
  return (
    <li className={`comment-thread ${comment.depth >= 3 ? "comment-thread-deep" : ""}`}>
      <article
        className="comment"
        id={`comment-${comment.id}`}
        aria-label={`${comment.giphy_id ? "Reaksjon" : "Kommentar"} fra ${comment.author_name_snapshot}`}
      >
        <header className="comment-header">
          <Avatar
            name={comment.author_name_snapshot}
            userId={comment.author_user_id}
            path={comment.author_photo_path}
          />
          <div>
            <strong>
              {comment.author_name_snapshot}
              {own && <span className="muted"> · Deg</span>}
            </strong>
            <small className="muted">
              <time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time>
              {comment.version > 0 && !comment.deleted_at && " · Redigert"}
            </small>
          </div>
        </header>
        {comment.deleted_at ? (
          <p className="muted">Kommentaren er slettet.</p>
        ) : (
          <>
            {comment.giphy_id ? (
              <ThreadMeme id={comment.giphy_id} />
            ) : (
              <p className="post-body comment-body">
                <LinkedText text={comment.body} />
              </p>
            )}
            <div className="comment-actions">
              {comment.depth < 64 && (
                <span className="comment-primary-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={mode === "reply"}
                    onClick={() => setMode(mode === "reply" ? null : "reply")}
                  >
                    Svar
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!giphyConfigured || busy}
                    onClick={() => {
                      memeRequest.current = null;
                      setPicker(true);
                    }}
                  >
                    Reager
                  </button>
                </span>
              )}
              {own && !comment.giphy_id && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setMode(mode === "edit" ? null : "edit")}
                >
                  Rediger kommentar
                </button>
              )}
              {(own || admin) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setConfirmDelete(true)}
                >
                  {comment.giphy_id ? "Slett reaksjon" : "Slett kommentar"}
                </button>
              )}
            </div>
            {picker && (
              <GiphyPicker
                onClose={() => setPicker(false)}
                onPick={async (gif) => {
                  if (memeLock.current) return;
                  memeLock.current = true;
                  setBusy(true);
                  setError(undefined);
                  if (memeRequest.current?.gif !== gif)
                    memeRequest.current = { gif, id: crypto.randomUUID() };
                  try {
                    const result = await save("meme", {
                      id: memeRequest.current.id,
                      parent_id: comment.id,
                      giphy_id: gif,
                    });
                    setError(result.error);
                    if (result.error) throw new Error(result.error);
                    setPicker(false);
                    memeRequest.current = null;
                  } finally {
                    memeLock.current = false;
                    setBusy(false);
                  }
                }}
              />
            )}
            {confirmDelete && (
              <div className="comment-delete">
                <p>
                  {comment.giphy_id ? "Slette reaksjonen?" : "Slette kommentaren?"} Svarene blir
                  beholdt.
                </p>
                <div className="comment-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (busy) return;
                      setBusy(true);
                      setError(undefined);
                      const result = await save("delete", {
                        id: comment.id,
                        expected_version: comment.version,
                      });
                      setError(result.error);
                      setBusy(false);
                      if (!result.error) setConfirmDelete(false);
                    }}
                  >
                    Bekreft sletting
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            {mode && (
              <CommentForm
                key={`${mode}-${comment.version}`}
                save={save}
                label={
                  mode === "edit"
                    ? "Rediger kommentaren"
                    : `Svar til ${comment.author_name_snapshot}`
                }
                parent={mode === "reply" ? comment.id : undefined}
                edit={mode === "edit" ? comment : undefined}
                onDone={() => setMode(null)}
              />
            )}
          </>
        )}
      </article>
      {!!comment.replies.length && (
        <ol className="comment-replies">
          {comment.replies.map((reply) => (
            <Comment key={reply.id} comment={reply} save={save} userId={userId} admin={admin} />
          ))}
        </ol>
      )}
    </li>
  );
}
