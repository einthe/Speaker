export type ImageSnapshot = {
  url?: string;
  source?: string;
  state: "loading" | "loaded" | "error";
};
export const emptyImage: ImageSnapshot = { state: "loading" };
const failedImage: ImageSnapshot = { state: "error" };
const freshFor = 30_000;
const keepFor = 15 * 60_000;
type Entry = {
  snapshot: ImageSnapshot;
  etag?: string;
  bytes: number;
  checked: number;
  used: number;
  controller?: AbortController;
  pending?: Promise<void>;
};

// Owned by one authenticated provider, never shared between users or persisted.
export class SessionImageCache {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<() => void>>();

  constructor(
    private maxBytes = 24 * 1024 * 1024,
    private maxEntries = 128,
  ) {}

  get = (key: string): ImageSnapshot => this.entries.get(key)?.snapshot ?? emptyImage;

  getAvailable = (key: string): ImageSnapshot => {
    const exact = this.get(key);
    if (exact !== emptyImage) return exact;
    const identity = imageIdentity(key);
    for (const [candidate, entry] of this.entries) {
      if (entry.snapshot.url && imageIdentity(candidate) === identity) return entry.snapshot;
    }
    return emptyImage;
  };

  subscribe(key: string, listener: () => void) {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
      this.prune();
    };
  }

  private notify() {
    // A view can show another cached size of the same photo while upgrading it.
    this.listeners.forEach((listeners) => listeners.forEach((listener) => listener()));
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    entry?.controller?.abort();
    if (entry?.snapshot.url) URL.revokeObjectURL(entry.snapshot.url);
    this.notify();
  }

  clear() {
    for (const key of this.entries.keys()) this.remove(key);
  }

  invalidate(path: string) {
    for (const key of this.entries.keys()) {
      if (key.split("?")[0] === path) this.remove(key);
    }
  }

  private prune() {
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    const oldest = [...this.entries].sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of oldest) {
      // Mounted images keep their URLs until they are no longer displayed.
      if (
        this.listeners.has(key) ||
        entry.pending ||
        (entry.snapshot.url &&
          [...this.listeners.keys()].some(
            (visible) => this.getAvailable(visible).url === entry.snapshot.url,
          ))
      )
        continue;
      if (
        Date.now() - entry.used > keepFor ||
        bytes > this.maxBytes ||
        this.entries.size > this.maxEntries
      ) {
        bytes -= entry.bytes;
        this.remove(key);
      }
    }
  }

  load(key: string, force = false): Promise<void> {
    if (!/^\/(media|avatars)\/[^/?]+(?:\?.*)?$/.test(key)) return Promise.resolve();
    this.prune();
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { snapshot: emptyImage, bytes: 0, checked: 0, used: Date.now() };
      this.entries.set(key, entry);
    }
    entry.used = Date.now();
    if (entry.pending) return entry.pending;
    if (!force && entry.snapshot.url && Date.now() - entry.checked < freshFor)
      return Promise.resolve();
    const controller = new AbortController();
    entry.controller = controller;
    const current = entry;
    const isCurrent = () => !controller.signal.aborted && this.entries.get(key) === current;
    if (!entry.snapshot.url) {
      entry.snapshot = emptyImage;
      this.notify();
    }
    entry.pending = (async () => {
      let nextUrl: string | undefined;
      try {
        const response = await fetch(key, {
          credentials: "same-origin",
          cache: "no-cache",
          signal: controller.signal,
          headers: current.etag ? { "If-None-Match": current.etag } : undefined,
        });
        if (!isCurrent()) return;
        if ([401, 403].includes(response.status)) {
          this.clear();
          return;
        }
        if ([404, 410, 415].includes(response.status)) {
          this.invalidate(key.split("?")[0]);
          this.entries.set(key, { snapshot: failedImage, bytes: 0, checked: 0, used: Date.now() });
          this.notify();
          return;
        }
        if (response.status === 304 && current.snapshot.url) {
          current.checked = Date.now();
          return;
        }
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
          throw new Error("image_unavailable");
        const etag = response.headers.get("etag") ?? undefined;
        if (etag && etag === current.etag && current.snapshot.url) {
          current.checked = Date.now();
          await response.body?.cancel();
          return;
        }
        const blob = await response.blob();
        if (!isCurrent()) return;
        nextUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.src = nextUrl;
        await image.decode();
        if (!isCurrent()) return;
        const previous = current.snapshot.url;
        current.snapshot = { url: nextUrl, source: key, state: "loaded" };
        current.bytes = blob.size;
        current.etag = etag;
        current.checked = Date.now();
        nextUrl = undefined;
        this.notify();
        if (previous) URL.revokeObjectURL(previous);
      } catch {
        if (isCurrent() && !this.getAvailable(key).url) {
          current.snapshot = failedImage;
          this.notify();
        }
        // Temporary network failures retain an already displayed photo.
      } finally {
        if (nextUrl) URL.revokeObjectURL(nextUrl);
        if (isCurrent()) {
          current.pending = undefined;
          current.controller = undefined;
          this.prune();
        }
      }
    })();
    return entry.pending;
  }
}

function imageIdentity(src: string) {
  const url = new URL(src, "https://local.invalid");
  url.searchParams.delete("w");
  return url.pathname + url.search;
}

export function imageCandidate(
  src: string,
  srcSet: string | undefined,
  width: number,
  density: number,
) {
  const candidates = srcSet
    ?.split(",")
    .map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      return { url, width: Number(descriptor?.replace(/w$/, "")) };
    })
    .filter((candidate) => candidate.width > 0)
    .sort((a, b) => a.width - b.width);
  return (
    candidates?.find((candidate) => candidate.width >= width * density)?.url ??
    candidates?.at(-1)?.url ??
    src
  );
}
