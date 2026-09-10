import { useQuery } from "@tanstack/react-query";
import { skinImages } from "@/lib/skins.functions";

function keyOf(name: string) {
  return name
    .toLowerCase()
    .replace(/^(stattrak™|★|souvenir)\s*/g, "")
    .replace(/\s*\((factory new|minimal wear|field-tested|well-worn|battle-scarred)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve artwork from an already loaded map (for lists that render many skins). */
export function skinArt(
  map: Record<string, string> | undefined,
  name: string | null | undefined,
  fallback: string | null | undefined,
) {
  if (!name || !map) return fallback ?? null;
  return map[keyOf(name)] ?? fallback ?? null;
}

export function useSkinImages() {
  return useQuery({
    queryKey: ["skin-images"],
    queryFn: () => skinImages(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Original CS2 artwork for a skin name, falling back to whatever the database stored. */
export function useSkinImage(name: string | null | undefined, fallback: string | null | undefined) {
  const { data } = useSkinImages();
  if (!name || !data) return fallback ?? null;
  return data[keyOf(name)] ?? fallback ?? null;
}
