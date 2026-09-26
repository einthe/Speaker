"use client";
import { useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { imageWidths } from "@/lib/image-variants";
import { postImageRatio, type PostMedia } from "@/lib/post-media";
import { DeleteButton } from "./forms";
import { LoadingImage } from "./loading-image";

export function PostGallery({
  images,
  title,
  detail,
  editable,
  responsiveImages,
}: {
  images: PostMedia[];
  title: string;
  detail: boolean;
  editable: boolean;
  responsiveImages: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const multiple = images.length > 1;
  const goTo = (index: number) => {
    const container = track.current;
    if (!container) return;
    const target = Math.max(0, Math.min(images.length - 1, index));
    container.scrollTo({
      left: target * container.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <div
      className={`post-image-wrap post-gallery ${multiple ? "post-gallery--multiple" : ""}`}
      role="region"
      data-post-interactive
      aria-label={`Bilder til ${title}`}
      aria-roledescription="bildekarusell"
    >
      <div className="post-gallery-stage">
        <div
          className="post-gallery-track"
          ref={track}
          tabIndex={multiple ? 0 : undefined}
          aria-label={multiple ? "Bilder – bruk piltastene for å bla" : undefined}
          onScroll={(event) => {
            const el = event.currentTarget;
            setActive(
              Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / el.clientWidth))),
            );
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              goTo(active + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
        >
          {images.map((media, index) => (
            <div
              className="post-gallery-slide"
              key={media.id}
              role="group"
              aria-label={`${index + 1} av ${images.length}`}
              aria-hidden={index !== active}
              style={{ "--image-ratio": multiple ? 4 / 3 : postImageRatio(media) } as CSSProperties}
            >
              <LoadingImage
                frameClassName="post-image-frame"
                retryable={index === active}
                key={responsiveImages ? "responsive" : "full"}
                className="post-image"
                src={`/media/${media.id}${responsiveImages ? "" : "?w=2400"}`}
                srcSet={
                  responsiveImages
                    ? imageWidths.post
                        .map((width) => `/media/${media.id}?w=${width} ${width}w`)
                        .join(", ")
                    : undefined
                }
                sizes={
                  !responsiveImages
                    ? undefined
                    : detail
                      ? "(max-width: 760px) calc(100vw - 82px), (max-width: 1190px) min(742px, calc(100vw - 304px)), min(742px, calc(100vw - 356px))"
                      : "(max-width: 760px) calc(100vw - 82px), (max-width: 980px) calc(100vw - 304px), (max-width: 1190px) calc(100vw - 569px), (max-width: 1499px) calc(100vw - 668px), min(974px, calc(100vw - 700px))"
                }
                width={media.width ?? undefined}
                height={media.height ?? undefined}
                loading="lazy"
                alt={media.alt_text || `Bilde ${index + 1} til innlegget ${title}`}
              />
            </div>
          ))}
        </div>
        {multiple && (
          <>
            <button
              type="button"
              className="gallery-arrow gallery-previous"
              aria-label="Forrige bilde"
              disabled={active === 0}
              onClick={() => goTo(active - 1)}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="gallery-arrow gallery-next"
              aria-label="Neste bilde"
              disabled={active === images.length - 1}
              onClick={() => goTo(active + 1)}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      {multiple && (
        <div className="gallery-pagination">
          <div className="gallery-dots">
            {images.map((media, index) => (
              <button
                key={media.id}
                type="button"
                aria-label={`Vis bilde ${index + 1} av ${images.length}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => goTo(index)}
              >
                <span />
              </button>
            ))}
          </div>
          <span className="muted" aria-live="polite" aria-atomic="true">
            {active + 1} / {images.length}
          </span>
        </div>
      )}
      {detail && editable && images[active] && (
        <DeleteButton
          key={images[active].id}
          action="remove-media"
          id={images[active].id}
          label="Fjern bilde"
        />
      )}
    </div>
  );
}
