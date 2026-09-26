import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  cache: new Map<string, string>(),
  cacheFailure: "",
  account: vi.fn(),
  client: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/queries", () => ({ getAccount: mocks.account }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({
  unstable_cache: (generate: () => Promise<string>, parts: string[]) => async () => {
    if (mocks.cacheFailure === "read") throw new Error("cache unavailable");
    const key = JSON.stringify(parts);
    if (mocks.cache.has(key)) return mocks.cache.get(key);
    const result = await generate();
    if (mocks.cacheFailure === "write") throw new Error("cache entry too large");
    mocks.cache.set(key, result);
    return result;
  },
}));

import { GET as postImage } from "@/app/media/[id]/route";
import { GET as avatarImage } from "@/app/avatars/[id]/route";
import { warmImageVariants } from "@/server/private-images";

const id = "00000000-0000-4000-a000-000000000001";
const picture = (color: string) =>
  sharp({ create: { width: 1800, height: 1200, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
let source: Buffer;
let path: string | null;
let version: string;
let exists: boolean;
const download = vi.fn(async () => ({ data: new Blob([new Uint8Array(source)]), error: null }));
const info = vi.fn(async () => ({ data: exists ? { id, version } : null, error: null }));
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: path ? { storage_path: path } : null }),
};
const db = { from: () => query, storage: { from: () => ({ download, info }) } };

function request(kind: "post" | "avatar", query = "", tag?: string) {
  return (kind === "post" ? postImage : avatarImage)(
    new Request(`https://example.test/${kind}/${id}${query}`, {
      headers: tag ? { "If-None-Match": tag } : undefined,
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.cache.clear();
  mocks.cacheFailure = "";
  source = await picture("#167d8d");
  path = `${id}/photo.webp`;
  version = "version-one";
  exists = true;
  mocks.account.mockResolvedValue({ id: "viewer-one", account_status: "approved" });
  mocks.client.mockResolvedValue(db);
});

describe.each(["post", "avatar"] as const)("private %s images", (kind) => {
  const width = kind === "post" ? 480 : 64;
  const query = `?w=${width}`;

  it("serves small WebP variants and revalidates without redownloading or re-encoding", async () => {
    const first = await request(kind, query);
    expect(first.status).toBe(200);
    const metadata = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(kind === "avatar" ? width : 320);
    expect(first.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
    expect(first.headers.get("vary")).toBe("Cookie, Authorization");
    const tag = first.headers.get("etag")!;
    expect(tag).toBeTruthy();
    const revalidated = await request(kind, query, `"unrelated", W/${tag}`);
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    expect((await request(kind, query)).status).toBe(200);
    expect(download).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(4); // Every request plus the generation race check.
  });

  it.each([null, "pending", "disabled", "rejected"])(
    "denies %s viewers even with a matching ETag",
    async (status) => {
      const first = await request(kind, query);
      mocks.account.mockResolvedValue(status ? { id: "viewer-one", account_status: status } : null);
      const denied = await request(kind, query, first.headers.get("etag")!);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("cache-control")).toBe("private, no-store");
      expect(download).toHaveBeenCalledTimes(1);
    },
  );

  it("does not serve cached bytes when the attachment or source has been deleted", async () => {
    const first = await request(kind, query);
    exists = false;
    expect((await request(kind, query, first.headers.get("etag")!)).status).toBe(404);
    exists = true;
    path = null;
    expect((await request(kind, query, first.headers.get("etag")!)).status).toBe(404);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("detects replacement at the same storage path", async () => {
    const first = await request(kind, query);
    source = await picture("#e83020");
    version = "version-two";
    const updated = await request(kind, query, first.headers.get("etag")!);
    expect(updated.status).toBe(200);
    expect(updated.headers.get("etag")).not.toBe(first.headers.get("etag"));
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("keeps browser validators separate between accounts", async () => {
    const first = await request(kind, query);
    mocks.account.mockResolvedValue({ id: "viewer-two", account_status: "approved" });
    const other = await request(kind, query, first.headers.get("etag")!);
    expect(other.status).toBe(200);
    expect(other.headers.get("etag")).not.toBe(first.headers.get("etag"));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("does not cache a source that changes during generation", async () => {
    info.mockResolvedValueOnce({ data: { id, version: "old" }, error: null });
    info.mockResolvedValueOnce({ data: { id, version: "new" }, error: null });
    expect((await request(kind, query)).status).toBe(409);
    expect(mocks.cache.size).toBe(0);
  });

  it("rejects arbitrary sizes and untrusted direct uploads", async () => {
    expect((await request(kind, "?w=900000")).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
    source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect((await request(kind, query)).status).toBe(415);
    source = Buffer.from("not an image");
    expect((await request(kind, query)).status).toBe(415);
    expect(mocks.cache.size).toBe(0);
  });

  it.each(["read", "write"])(
    "still serves validated images on a cache %s failure",
    async (failure) => {
      mocks.cacheFailure = failure;
      expect((await request(kind, query)).status).toBe(200);
      expect(download).toHaveBeenCalledTimes(1);
    },
  );

  it("warms every size from the validated upload without downloading it again", async () => {
    await warmImageVariants(
      db as unknown as Parameters<typeof warmImageVariants>[0],
      kind,
      path!,
      source,
    );
    expect(mocks.cache.size).toBe(4);
    expect((await request(kind, query)).status).toBe(200);
    expect(download).not.toHaveBeenCalled();
  });
});

it("refuses obsolete avatar URLs after replacement", async () => {
  expect((await request("avatar", "?v=old-photo.webp")).status).toBe(404);
  expect(download).not.toHaveBeenCalled();
});
