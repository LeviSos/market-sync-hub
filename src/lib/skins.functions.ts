import { createServerFn } from "@tanstack/react-start";

type ApiSkin = { name?: string; image?: string };

let cache: { at: number; map: Record<string, string> } | null = null;
const TTL = 6 * 60 * 60 * 1000;

const SOURCES = [
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/ru/skins.json",
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json",
];

function keyOf(name: string) {
  return name
    .toLowerCase()
    .replace(/^(stattrak™|★|souvenir)\s*/g, "")
    .replace(/\s*\((factory new|minimal wear|field-tested|well-worn|battle-scarred)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Original CS2 skin artwork keyed by skin name (ru + en names both map to the same CDN image). */
export const skinImages = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const map: Record<string, string> = {};
  for (const url of SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = (await res.json()) as ApiSkin[];
      for (const row of rows) {
        if (!row?.name || !row?.image) continue;
        const k = keyOf(row.name);
        if (k && !map[k]) map[k] = row.image;
      }
    } catch {
      // one locale failing is fine, the other still fills the map
    }
  }
  if (Object.keys(map).length > 0) cache = { at: Date.now(), map };
  return cache?.map ?? map;
});
