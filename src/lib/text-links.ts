import { LinkifyIt } from "linkify-it";

const detector = new LinkifyIt({ fuzzyLink: true }).add("ftp:", null);
type TextPart = { text: string; href?: string };

export function textLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of detector.match(text) ?? []) {
    const candidate =
      match.schema === "" || match.schema === "//"
        ? match.url.replace(/^(?:http:)?\/\//i, "https://")
        : match.url;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) continue;
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ text: match.raw, href: url.href });
    cursor = match.lastIndex;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
