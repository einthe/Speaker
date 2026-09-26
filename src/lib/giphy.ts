import { z } from "zod";

export const giphyConfigured = Boolean(process.env.NEXT_PUBLIC_GIPHY_API_KEY);
const mediaUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (url.hostname === "giphy.com" || url.hostname.endsWith(".giphy.com"))
  );
});
const rendition = z.object({ url: mediaUrl });
export const giphyResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
      title: z.string(),
      images: z.object({ fixed_width: rendition, fixed_width_still: rendition }),
    }),
  ),
  pagination: z
    .object({ total_count: z.number(), count: z.number(), offset: z.number() })
    .optional(),
});
export type GiphyGif = z.infer<typeof giphyResponseSchema>["data"][number];

async function request(path: string, params: Record<string, string>, signal: AbortSignal) {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key) throw new Error("Memes er ikke tilgjengelige ennå.");
  const response = await fetch(
    `https://api.giphy.com/v1/gifs${path}?${new URLSearchParams({ api_key: key, rating: "pg-13", ...params })}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
  );
  if (response.status === 429) throw new Error("GIPHY har nådd søkegrensen. Prøv igjen senere.");
  if (!response.ok) throw new Error("Kunne ikke hente memes fra GIPHY. Prøv igjen.");
  return giphyResponseSchema.parse(await response.json());
}
export function searchGiphy(query: string, offset: number, signal: AbortSignal) {
  return request("/search", { q: query, limit: "20", offset: String(offset), lang: "en" }, signal);
}
export async function getGiphyGifs(ids: string[], signal: AbortSignal) {
  const gifs: GiphyGif[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const result = await request("", { ids: ids.slice(i, i + 100).join(",") }, signal);
    gifs.push(...result.data);
  }
  return gifs;
}
