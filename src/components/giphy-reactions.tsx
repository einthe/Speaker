"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { getGiphyGifs, giphyConfigured, searchGiphy, type GiphyGif } from "@/lib/giphy";
import type { MemeReaction } from "@/lib/discussions";
import { LoadingImage, ImagePlaceholder } from "./loading-image";

function Attribution() {
  return (
    <a
      className="giphy-attribution"
      href="https://giphy.com/"
      target="_blank"
      rel="noopener noreferrer"
    >
      Powered by GIPHY
    </a>
  );
}
export function GifImage({ gif }: { gif: GiphyGif }) {
  return (
    <LoadingImage
      frameClassName="meme-image-frame"
      src={gif.images.fixed_width.url}
      alt={gif.title || "Meme fra GIPHY"}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
type ReactTo = (id: string, active: boolean) => Promise<boolean>;

export function ThreadMeme({ id }: { id: string }) {
  const [result, setResult] = useState<{ gif?: GiphyGif; failed?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!giphyConfigured) return;
    const controller = new AbortController();
    getGiphyGifs([id], controller.signal)
      .then((gifs) => {
        if (!controller.signal.aborted) setResult({ gif: gifs[0], failed: !gifs.length });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ failed: true });
      });
    return () => controller.abort();
  }, [id, attempt]);
  return (
    <figure className="comment-meme">
      {result.gif ? (
        <GifImage gif={result.gif} />
      ) : (
        <span className="loading-image meme-image-frame">
          <ImagePlaceholder loading={giphyConfigured && !result.failed}>
            {giphyConfigured && !result.failed ? "Laster meme …" : "Meme utilgjengelig"}
          </ImagePlaceholder>
        </span>
      )}
      {result.failed && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setResult({});
            setAttempt((n) => n + 1);
          }}
        >
          Prøv å hente memet igjen
        </button>
      )}
      <figcaption>
        <Attribution />
      </figcaption>
    </figure>
  );
}

export function GiphyReactions({
  reactions,
  userId,
  reactTo,
  busy,
  collapsible = true,
}: {
  reactions: MemeReaction[];
  userId: string;
  reactTo: ReactTo;
  busy: boolean;
  collapsible?: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const titleId = useId();
  const groups = new Map<string, MemeReaction[]>();
  for (const reaction of reactions)
    groups.set(reaction.giphy_id, [...(groups.get(reaction.giphy_id) ?? []), reaction]);
  const idsKey = [...groups.keys()].sort().join(",");
  return (
    <section aria-labelledby={titleId} className="discussion-reactions">
      <div className="section-title">
        <h2 id={titleId}>Reaksjoner</h2>
        <div className="reaction-section-actions">
          {expanded && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setPicker(true)}
              disabled={busy || !giphyConfigured}
            >
              Reager med et meme
            </button>
          )}
          {collapsible && (
            <button
              type="button"
              className="text-button reaction-toggle"
              aria-expanded={expanded}
              aria-controls={contentId}
              disabled={busy}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
              {expanded ? "Skjul reaksjoner" : "Vis reaksjoner"}
            </button>
          )}
        </div>
      </div>
      <div id={contentId} hidden={!expanded}>
        {expanded && (
          <>
            {!giphyConfigured && <p className="muted">Memes er ikke tilgjengelige ennå.</p>}
            {giphyConfigured && (
              <>
                {idsKey && (
                  <ReactionGallery
                    key={idsKey}
                    idsKey={idsKey}
                    groups={groups}
                    userId={userId}
                    reactTo={reactTo}
                    busy={busy}
                  />
                )}
                {!idsKey && <p className="muted">Ingen reaksjoner ennå.</p>}
                <Attribution />
                {picker && (
                  <GiphyPicker
                    onClose={() => setPicker(false)}
                    onPick={async (id) => {
                      if (await reactTo(id, true)) setPicker(false);
                      else throw new Error("reaction_failed");
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function ReactionGallery({
  idsKey,
  groups,
  userId,
  reactTo,
  busy,
}: {
  idsKey: string;
  groups: Map<string, MemeReaction[]>;
  userId: string;
  reactTo: ReactTo;
  busy: boolean;
}) {
  const [result, setResult] = useState<{ gifs?: GiphyGif[]; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getGiphyGifs(idsKey.split(","), controller.signal)
      .then((gifs) => {
        if (!controller.signal.aborted) setResult({ gifs });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ error: "Reaksjonsbildene kunne ikke hentes." });
      });
    return () => controller.abort();
  }, [idsKey, retry]);
  return (
    <>
      {result.error && (
        <p role="alert" className="message error">
          {result.error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setResult({});
              setRetry((n) => n + 1);
            }}
          >
            Prøv igjen
          </button>
        </p>
      )}
      <div className="meme-grid reaction-gallery">
        {[...groups].map(([id, people]) => {
          const gif = result.gifs?.find((item) => item.id === id);
          const own = people.some((person) => person.author_user_id === userId);
          return (
            <div className="reaction-item" key={id}>
              <button
                type="button"
                className="meme-reaction"
                aria-pressed={own}
                disabled={busy}
                aria-label={`${own ? "Fjern" : "Legg til"} reaksjon: ${gif?.title || "Meme"} (${people.length})`}
                onClick={() => void reactTo(id, !own)}
              >
                {gif ? (
                  <GifImage gif={gif} />
                ) : (
                  <span className="loading-image meme-image-frame">
                    <ImagePlaceholder loading={!result.gifs && !result.error}>
                      {result.gifs || result.error ? "Meme utilgjengelig" : "Laster meme …"}
                    </ImagePlaceholder>
                  </span>
                )}
                <span className="reaction-count">
                  {people.length}
                  {own ? " · Deg" : ""}
                </span>
              </button>
              <ul className="reaction-people" aria-label="Reagert av">
                {people.map((person) => (
                  <li key={person.id}>{person.author_name_snapshot}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
export function GiphyPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (id: string) => Promise<void>;
}) {
  const titleId = useId();
  const searchId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState("memes");
  const [search, setSearch] = useState({ query: "memes", offset: 0, attempt: 0 });
  const [result, setResult] = useState<{ gifs: GiphyGif[]; total: number; error?: string } | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    searchGiphy(search.query, search.offset, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ gifs: data.data, total: data.pagination?.total_count ?? data.data.length });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            gifs: [],
            total: 0,
            error:
              error instanceof Error && !error.message.includes("[")
                ? error.message
                : "Kunne ikke hente memes. Prøv igjen.",
          });
      });
    return () => controller.abort();
  }, [search]);
  function load(query: string, offset: number) {
    setResult(null);
    setSearch({ query, offset, attempt: search.attempt + 1 });
  }
  return (
    <dialog
      ref={dialog}
      className="meme-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!sending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !sending) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="section-title">
        <h2 id={titleId}>Velg et meme</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Lukk memesøk"
          disabled={sending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        className="meme-search"
        onSubmit={(event) => {
          event.preventDefault();
          load(input, 0);
        }}
      >
        <label className="sr-only" htmlFor={searchId}>
          Søk etter memes
        </label>
        <input
          id={searchId}
          maxLength={50}
          required
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Søk etter memes …"
        />
        <button type="submit" className="button secondary" disabled={sending || !input.trim()}>
          <Search size={16} /> Søk
        </button>
      </form>
      <Attribution />
      {!result && <p role="status">Søker …</p>}
      {result?.error && (
        <p role="alert" className="message error">
          {result.error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => load(search.query, search.offset)}
          >
            Prøv igjen
          </button>
        </p>
      )}
      {sendError && (
        <p className="message error" role="alert">
          Kunne ikke lagre reaksjonen. Prøv igjen.
        </p>
      )}
      {result && !result.error && !result.gifs.length && (
        <p>Ingen memes funnet. Prøv et annet søk.</p>
      )}
      <div className="meme-grid">
        {result?.gifs.map((gif, index) => (
          <button
            className="meme-choice"
            type="button"
            key={`${gif.id}-${index}`}
            disabled={sending}
            aria-label={`Reager med ${gif.title || "dette memet"}`}
            onClick={async () => {
              if (sending) return;
              setSending(true);
              setSendError(false);
              try {
                await onPick(gif.id);
              } catch {
                setSendError(true);
              } finally {
                setSending(false);
              }
            }}
          >
            <GifImage gif={gif} />
          </button>
        ))}
      </div>
      {result && !result.error && (
        <div className="meme-pagination">
          <button
            className="button secondary"
            type="button"
            disabled={search.offset === 0 || sending}
            onClick={() => load(search.query, search.offset - 20)}
          >
            Forrige
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={sending || search.offset + 20 >= result.total || search.offset + 20 > 4999}
            onClick={() => load(search.query, search.offset + 20)}
          >
            Neste
          </button>
        </div>
      )}
    </dialog>
  );
}
