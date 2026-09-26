import { expect, it } from "vitest";
import { textLinks } from "@/lib/text-links";

it("recognizes full URLs, www addresses, bare Norwegian domains and email", () => {
  const parts = textLinks(
    "https://example.com/kamp?a=1&b=2#sett http://example.org www.volleyball.no volleyball.no kontakt@example.com",
  );
  expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual([
    "https://example.com/kamp?a=1&b=2#sett",
    "http://example.org/",
    "https://www.volleyball.no/",
    "https://volleyball.no/",
    "mailto:kontakt@example.com",
  ]);
});
it("preserves original text, spaces, line breaks and punctuation", () => {
  const text =
    "Les (https://example.com/kamp).\n\nSe www.volleyball.no, og https://example.com/wiki/Volleyball_(sport)!";
  const parts = textLinks(text);
  expect(parts.map((p) => p.text).join("")).toBe(text);
  expect(parts.filter((p) => p.href).map((p) => p.text)).toEqual([
    "https://example.com/kamp",
    "www.volleyball.no",
    "https://example.com/wiki/Volleyball_(sport)",
  ]);
});
it("supports international addresses, long URLs, and punctuation next to multiple links", () => {
  const text = `https://blåbær.no/påmelding\nhttps://example.com/${"a".repeat(500)}`;
  const parts = textLinks(text);
  expect(parts.map((p) => p.text).join("")).toBe(text);
  expect(parts.filter((p) => p.href)).toHaveLength(2);
  expect(parts[0].href).toBe(new URL("https://blåbær.no/påmelding").href);
});
it("leaves executable schemes and ordinary text as text", () => {
  for (const text of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "Vanlig innlegg\nmed flere linjer",
    "",
  ]) {
    const parts = textLinks(text);
    expect(parts.some((p) => p.href)).toBe(false);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  }
});
