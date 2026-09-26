export const maxPostImages = 10;
export const maxPostImageMB = 3;
export type PostMedia = {
  id: string;
  alt_text: string;
  sort_order?: number;
  width?: number | null;
  height?: number | null;
};

export function postImageRatio(media: PostMedia): number {
  return media.width && media.height && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 4 / 3;
}

// Accept the old to-one shape while existing cached posts are refreshed.
export function postImages(media: PostMedia[] | PostMedia | null | undefined): PostMedia[] {
  return (Array.isArray(media) ? [...media] : media ? [media] : []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id),
  );
}
