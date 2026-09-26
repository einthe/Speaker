import { expect, it } from "vitest";
import { commentThreads, type DiscussionComment } from "@/lib/discussions";
import { giphyResponseSchema } from "@/lib/giphy";

it("builds threads even when replies arrive first and retains deleted parent context", () => {
  const base = {
    author_user_id: "user",
    author_name_snapshot: "Player",
    body: "Reply",
    version: 0,
    created_at: "2026-09-20",
    updated_at: "2026-09-20",
    deleted_at: null,
  };
  const comments: DiscussionComment[] = [
    { ...base, id: "reply", parent_id: "root", depth: 1 },
    { ...base, id: "root", parent_id: null, depth: 0, body: "", deleted_at: "2026-09-20" },
    { ...base, id: "nested", parent_id: "reply", depth: 2 },
  ];
  const threads = commentThreads(comments);
  expect(threads).toHaveLength(1);
  expect(threads[0].replies[0].replies[0].id).toBe("nested");
  expect(threads[0].body).toBe("");
});
it("accepts Giphy URLs unchanged, including query strings, but rejects unsafe media URLs", () => {
  const url = "https://media2.giphy.com/media/abc/200w.gif?cid=123&rid=200w.gif&ct=g";
  const make = (value: string) => ({
    data: [
      {
        id: "abc",
        title: "Meme",
        images: { fixed_width: { url: value }, fixed_width_still: { url: value } },
      },
    ],
  });
  expect(giphyResponseSchema.parse(make(url)).data[0].images.fixed_width.url).toBe(url);
  for (const unsafe of [
    "javascript:alert(1)",
    "https://evil.test/a.gif",
    "http://media.giphy.com/a.gif",
    "https://giphy.com.evil.test/a.gif",
  ])
    expect(giphyResponseSchema.safeParse(make(unsafe)).success).toBe(false);
});
