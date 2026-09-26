export const imageWidths = {
  avatar: [64, 128, 256, 512],
  post: [480, 960, 1600, 2400],
} as const;
export type ImageKind = keyof typeof imageWidths;

export function imageWidth(kind: ImageKind, value: string | null): number | null {
  if (value === null) return kind === "avatar" ? 128 : 1600;
  const width = Number(value);
  return (imageWidths[kind] as readonly number[]).includes(width) ? width : null;
}
