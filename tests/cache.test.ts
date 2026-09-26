import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { queries, keys, invalidateChange, AccessChanged } from "@/lib/cache/queries";
import { accessScope } from "@/lib/cache/contract";
import type { Post, Profile, TeamEvent } from "@/lib/domain";
const clients: QueryClient[] = [];
const client = () => {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(value);
  return value;
};
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const profile = { id: "one", base_role: "coach", account_status: "approved" } as Profile;
const post = { id: "post-one", title: "Cached post", post_media: null } as Post;
const reply = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
describe("private read cache", () => {
  it.each(["profile-photo", "remove-profile-photo"])(
    "refreshes comment photos after %s within the current account",
    async (kind) => {
      const db = client();
      const postDiscussion = queries.discussion("alice", {
        target_type: "post",
        target_id: "post",
      }).queryKey;
      const eventDiscussion = queries.discussion("alice", {
        target_type: "event",
        target_id: "event",
      }).queryKey;
      const otherAccount = queries.discussion("bob", {
        target_type: "post",
        target_id: "post",
      }).queryKey;
      for (const key of [postDiscussion, eventDiscussion, otherAccount])
        db.setQueryData(key, { comments: [], reactions: [] });
      await invalidateChange(db, "alice", { kind });
      expect(db.getQueryState(postDiscussion)?.isInvalidated).toBe(true);
      expect(db.getQueryState(eventDiscussion)?.isInvalidated).toBe(true);
      expect(db.getQueryState(otherAccount)?.isInvalidated).toBe(false);
    },
  );
  it("reuses a fresh query and renders stale data while a background fetch is pending", async () => {
    vi.useFakeTimers();
    const db = client();
    let complete!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ posts: [post], count: 1 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const options = queries.posts("scope");
    await db.fetchQuery(options);
    await db.fetchQuery(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 31_000);
    const observer = new QueryObserver(db, options);
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data?.posts[0].title).toBe("Cached post");
    expect(observer.getCurrentResult().isFetching).toBe(true);
    complete(reply({ posts: [{ ...post, title: "Updated post" }], count: 1 }));
    await db.fetchQuery(options);
    expect(observer.getCurrentResult().data?.posts[0].title).toBe("Updated post");
    stop();
  });
  it("seeds stale detail data from lists only within the same authorization scope", () => {
    const db = client();
    db.setQueryData(queries.posts("alice").queryKey, { posts: [post], count: 1 });
    const event = { id: "match", title: "Cached event" } as TeamEvent;
    db.setQueryData(queries.events("alice").queryKey, { events: [event], count: 1 });
    const detail = new QueryObserver(db, queries.post("alice", post.id, db)).getCurrentResult();
    expect(detail.data).toEqual(post);
    expect(detail.isStale).toBe(true);
    expect(db.getQueryData(keys.post("alice", post.id))).toEqual(post);
    expect(
      new QueryObserver(db, queries.post("bob", post.id, db)).getCurrentResult().data,
    ).toBeUndefined();
    expect(
      new QueryObserver(db, queries.event("alice", "match", db)).getCurrentResult().data,
    ).toEqual(event);
  });
  it("retains list-seeded detail content if the canonical read fails", async () => {
    const db = client();
    db.setQueryData(queries.posts("scope").queryKey, { posts: [post], count: 1 });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: "offline" }), { status: 500 })),
    );
    await expect(db.fetchQuery(queries.post("scope", post.id, db))).rejects.toThrow("offline");
    expect(db.getQueryData(keys.post("scope", post.id))).toEqual(post);
  });
  it("changes scope when user, base role, status or secondary roles change", () => {
    const scope = accessScope(profile, []);
    expect(accessScope({ ...profile, id: "two" }, [])).not.toBe(scope);
    expect(accessScope({ ...profile, base_role: "player" }, [])).not.toBe(scope);
    expect(accessScope({ ...profile, account_status: "disabled" }, [])).not.toBe(scope);
    expect(accessScope(profile, ["captain"])).not.toBe(scope);
    expect(accessScope(profile, ["captain", "team_manager"])).toBe(
      accessScope(profile, ["team_manager", "captain"]),
    );
  });
  it("targets mutation invalidation and removes deleted detail data without clearing unrelated data", async () => {
    const db = client();
    db.setQueryData(queries.posts("scope").queryKey, { posts: [post], count: 1 });
    db.setQueryData(keys.post("scope", post.id), post);
    db.setQueryData(keys.roster("scope"), [{ id: "player" }]);
    db.setQueryData(keys.notifications("scope"), []);
    db.setQueryData(queries.posts("other").queryKey, { posts: [post], count: 1 });
    await invalidateChange(db, "scope", { kind: "delete-post", postId: post.id });
    expect(db.getQueryData(keys.post("scope", post.id))).toBeUndefined();
    expect(db.getQueryData(queries.posts("scope").queryKey)).toEqual({ posts: [], count: 0 });
    expect(db.getQueryState(keys.roster("scope"))?.isInvalidated).toBe(false);
    expect(db.getQueryState(keys.notifications("scope"))?.isInvalidated).toBe(false);
    expect(db.getQueryState(queries.posts("other").queryKey)?.isInvalidated).toBe(false);
  });
  it("rejects changed authorization instead of caching a response in the old scope", async () => {
    const db = client();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ destination: "/feed" }), { status: 409 })),
    );
    await expect(db.fetchQuery(queries.roster("old-scope"))).rejects.toBeInstanceOf(AccessChanged);
    expect(db.getQueryData(keys.roster("old-scope"))).toBeUndefined();
  });
});
