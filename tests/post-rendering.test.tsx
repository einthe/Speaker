import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PostCard, PostForm } from "@/components/posts";
import type { Post, Profile } from "@/lib/domain";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions", () => ({ mutate: vi.fn() }));
vi.mock("@/server/post-images", () => ({ uploadPostImage: vi.fn() }));
vi.mock("@/server/auth-actions", () => ({ authAction: vi.fn() }));

const profile: Profile = {
  id: "00000000-0000-4000-a000-000000000001",
  full_name: "Test Player",
  base_role: "player",
  account_status: "approved",
  created_at: "2026-09-19T10:00:00Z",
};
const post = {
  id: "00000000-0000-4000-a000-000000000002",
  author_user_id: profile.id,
  author_name_snapshot: profile.full_name,
  base_role_snapshot: "player",
  post_type: "normal",
  title: "Beskjed til laget",
  body: "Vi ses på trening!",
  created_at: profile.created_at,
  updated_at: profile.created_at,
  edited_at: null,
  lineup_id: null,
  secondary_role_context_key: null,
  secondary_role_context_label_snapshot: null,
};
describe("Post gallery and legacy attachment rendering", () => {
  for (const attachment of [
    null,
    { id: "00000000-0000-4000-a000-000000000003", alt_text: "Laget" },
    [],
    [
      { id: "00000000-0000-4000-a000-000000000003", alt_text: "Laget" },
      { id: "00000000-0000-4000-a000-000000000004", alt_text: "Trening" },
    ],
  ]) {
    it(`renders the feed, detail and edit form when post_media is ${attachment ? "an object" : "null"}`, () => {
      const data = { ...post, post_media: attachment } as unknown as Post;
      expect(renderToStaticMarkup(<PostCard post={data} profile={profile} />)).toContain(
        post.title,
      );
      expect(renderToStaticMarkup(<PostCard post={data} profile={profile} detail />)).toContain(
        "Slett innlegg",
      );
      const form = renderToStaticMarkup(<PostForm post={data} roles={[]} />);
      expect(form).toContain("Lagre endringer");
      expect(form).toContain('name="image"');
      expect(form).toContain('multiple=""');
      const card = renderToStaticMarkup(<PostCard post={data} profile={profile} />);
      expect(card.includes('aria-label="Neste bilde"')).toBe(
        Array.isArray(attachment) && attachment.length > 1,
      );
    });
  }
});
