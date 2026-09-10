import { useQuery } from "@tanstack/react-query";
import { COVER_PREFIX, signCaseCover } from "@/lib/covers.functions";

/**
 * Resolves a stored cover value to something an <img> can use.
 * `storage:<path>` values are signed on demand (private bucket), plain URLs
 * are returned as-is.
 */
export function useCoverUrl(value: string | null | undefined) {
  const path =
    typeof value === "string" && value.startsWith(COVER_PREFIX)
      ? value.slice(COVER_PREFIX.length)
      : null;

  const signed = useQuery({
    queryKey: ["case-cover", path],
    queryFn: () => signCaseCover({ data: { path: path! } }),
    enabled: Boolean(path),
    staleTime: 30 * 60_000,
    retry: false,
  });

  if (path) return signed.data?.url ?? null;
  return value && value.trim() ? value : null;
}

export function CaseCover({
  value,
  alt = "",
  className = "",
}: {
  value: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = useCoverUrl(value);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
