"use client";
/* eslint-disable @next/next/no-img-element -- Private images bypass shared image optimization. */
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { emptyImage, imageCandidate, type SessionImageCache } from "@/lib/cache/images";
import { SessionImageContext } from "./session-image-provider";

type Props = Pick<
  ComponentProps<"img">,
  | "src"
  | "srcSet"
  | "sizes"
  | "width"
  | "height"
  | "alt"
  | "className"
  | "loading"
  | "referrerPolicy"
> & { frameClassName?: string; compact?: boolean; fallback?: ReactNode; retryable?: boolean };

export function ImagePlaceholder({
  loading = true,
  compact = false,
  children,
}: {
  loading?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <span
      className={`image-placeholder ${loading ? "image-placeholder-loading" : ""}`}
      role={loading && !compact ? "status" : undefined}
    >
      {loading ? (
        <LoaderCircle className="spin" size={compact ? 16 : 24} aria-hidden="true" />
      ) : (
        !compact && <ImageOff size={24} aria-hidden="true" />
      )}
      {!compact && (
        <span>{children ?? (loading ? "Laster bilde …" : "Bildet kunne ikke lastes.")}</span>
      )}
      {compact && !loading && children}
    </span>
  );
}

export function LoadingImage(props: Props) {
  const cache = useContext(SessionImageContext);
  if (cache && typeof props.src === "string" && /^\/(media|avatars)\//.test(props.src)) {
    return (
      <PrivateImageFrame
        key={`${props.src}:${props.srcSet ?? ""}`}
        {...props}
        src={props.src}
        cache={cache}
      />
    );
  }
  return <ImageFrame key={`${props.src}:${props.srcSet ?? ""}`} {...props} />;
}

function PrivateImageFrame({
  cache,
  frameClassName = "",
  compact = false,
  fallback,
  retryable = false,
  src,
  srcSet,
  ...props
}: Props & { src: string; cache: SessionImageCache }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [requestSrc, setRequestSrc] = useState(src);
  const [visible, setVisible] = useState(false);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(requestSrc, listener),
    [cache, requestSrc],
  );
  const getSnapshot = useCallback(() => cache.getAvailable(requestSrc), [cache, requestSrc]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => emptyImage);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () =>
      setRequestSrc(
        imageCandidate(
          src,
          srcSet,
          element.getBoundingClientRect().width,
          window.devicePixelRatio || 1,
        ),
      );
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    window.addEventListener("resize", measure);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting || props.loading !== "lazy"),
      {
        rootMargin: "200px",
      },
    );
    observer.observe(element);
    return () => {
      resize.disconnect();
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [src, srcSet, props.loading]);
  useEffect(() => {
    if (!visible) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void cache.load(requestSrc);
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [cache, requestSrc, visible]);
  return (
    <span
      ref={frame}
      className={`loading-image ${frameClassName}`}
      data-state={snapshot.state}
      aria-busy={snapshot.state === "loading"}
    >
      <img
        {...props}
        src={snapshot.url}
        data-source={src}
        data-request-src={requestSrc}
        data-loaded-src={snapshot.source}
        alt={props.alt ?? ""}
        decoding="async"
        draggable={false}
      />
      {snapshot.state !== "loaded" && (
        <ImagePlaceholder loading={snapshot.state === "loading"} compact={compact}>
          {snapshot.state === "error" ? fallback : undefined}
        </ImagePlaceholder>
      )}
      {snapshot.state === "error" && retryable && (
        <button
          type="button"
          className="button secondary image-retry"
          onClick={() => void cache.load(requestSrc, true)}
        >
          Prøv igjen
        </button>
      )}
    </span>
  );
}
function ImageFrame({
  frameClassName = "",
  compact = false,
  fallback,
  retryable = false,
  ...props
}: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const checkCachedImage = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.currentSrc) setState(node.naturalWidth > 0 ? "loaded" : "error");
  }, []);
  return (
    <span
      className={`loading-image ${frameClassName}`}
      data-state={state}
      aria-busy={state === "loading"}
    >
      <img
        {...props}
        alt={props.alt ?? ""}
        key={attempt}
        ref={checkCachedImage}
        decoding="async"
        draggable={false}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
      {state !== "loaded" && (
        <ImagePlaceholder loading={state === "loading"} compact={compact}>
          {state === "error" ? fallback : undefined}
        </ImagePlaceholder>
      )}
      {state === "error" && retryable && (
        <button
          type="button"
          className="button secondary image-retry"
          onClick={() => {
            setState("loading");
            setAttempt((value) => value + 1);
          }}
        >
          Prøv igjen
        </button>
      )}
    </span>
  );
}
