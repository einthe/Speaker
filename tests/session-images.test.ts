import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyImage, imageCandidate, SessionImageCache } from "@/lib/cache/images";

const source = "/media/photo?w=480";
const photo = (etag = '"one"') =>
  new Response(new Blob(["photo"], { type: "image/webp" }), {
    headers: { "Content-Type": "image/webp", ETag: etag },
  });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let revoke: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => photo());
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = async () => {};
    },
  );
  revoke = vi.spyOn(URL, "revokeObjectURL");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("session image cache", () => {
  it("displays a cached image during refresh, uses ETags, and deduplicates requests", async () => {
    const cache = new SessionImageCache();
    await cache.load(source);
    const first = cache.get(source);
    expect(first.state).toBe("loaded");
    expect(first.url).toMatch(/^blob:/);
    await cache.load(source);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const refresh = cache.load(source);
    expect(cache.load(source)).toBe(refresh);
    expect(cache.get(source)).toBe(first);
    fetcher.mockRejectedValueOnce(new Error("offline while resizing"));
    await cache.load("/media/photo?w=960");
    expect(cache.getAvailable("/media/photo?w=960")).toBe(first);
    resolve(new Response(null, { status: 304 }));
    await refresh;
    expect(cache.get(source)).toBe(first);
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ "If-None-Match": '"one"' });
    await cache.load(source, true);
    expect(cache.get(source)).toBe(first);
    fetcher.mockResolvedValueOnce(photo('"two"'));
    await cache.load(source, true);
    expect(cache.get(source).url).not.toBe(first.url);
    expect(revoke).toHaveBeenCalledWith(first.url);
    cache.clear();
  });

  it("retains photos on temporary failures but drops every size on removal and all photos on denied access", async () => {
    const cache = new SessionImageCache();
    await cache.load(source);
    const first = cache.get(source);
    fetcher.mockRejectedValueOnce(new Error("offline"));
    await cache.load(source, true);
    expect(cache.get(source)).toBe(first);
    await cache.load("/media/other?w=480");
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await cache.load(source, true);
    expect(cache.get(source)).toBe(emptyImage);
    expect(cache.get("/media/other?w=480")).toBe(emptyImage);
    await cache.load(source);
    await cache.load("/media/photo?w=960");
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await cache.load(source, true);
    expect(cache.get(source)).toEqual({ state: "error" });
    expect(cache.getAvailable("/media/photo?w=960")).toBe(emptyImage);
    cache.clear();
  });

  it("clearing aborts pending requests and prevents late responses from restoring private images", async () => {
    const cache = new SessionImageCache();
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = cache.load(source);
    const signal = fetcher.mock.calls[0][1]?.signal;
    cache.clear();
    expect(signal?.aborted).toBe(true);
    resolve(photo());
    await loading;
    expect(cache.get(source)).toBe(emptyImage);
  });

  it("bounds unused images, preserves mounted ones, and isolates instances and photo versions", async () => {
    const cache = new SessionImageCache(100, 1);
    const unsubscribe = cache.subscribe(source, () => {});
    await cache.load(source);
    const first = cache.get(source);
    expect(new SessionImageCache().get(source)).toBe(emptyImage);
    expect(cache.getAvailable("/media/photo?w=960")).toBe(first);
    await cache.load("/avatars/player?v=old&w=64");
    expect(cache.getAvailable("/avatars/player?v=new&w=64")).toBe(emptyImage);
    expect(cache.get(source)).toBe(first);
    unsubscribe();
    vi.advanceTimersByTime(16 * 60_000);
    await cache.load("/media/new?w=480");
    expect(cache.get(source)).toBe(emptyImage);
    expect(revoke).toHaveBeenCalledWith(first.url);
    cache.clear();
  });

  it("does not fetch arbitrary URLs and chooses a fitting responsive size", async () => {
    const cache = new SessionImageCache();
    await cache.load("https://example.com/image");
    expect(fetcher).not.toHaveBeenCalled();
    const candidates =
      "/media/photo?w=480 480w, /media/photo?w=960 960w, /media/photo?w=1600 1600w";
    expect(imageCandidate(source, candidates, 300, 3)).toBe("/media/photo?w=960");
    expect(imageCandidate(source, candidates, 900, 3)).toBe("/media/photo?w=1600");
    expect(imageCandidate(source, undefined, 300, 3)).toBe(source);
  });
});
