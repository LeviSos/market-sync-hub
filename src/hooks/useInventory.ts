import { useQuery } from "@tanstack/react-query";
import { getInventory } from "@/lib/game.functions";
import { useMe } from "@/hooks/useAuth";
import { usePlay, type LocalItem } from "@/lib/local-play";

/**
 * The one inventory every game screen reads.
 *
 * In local (demo) play the list comes from the browser store, so contracts and
 * the upgrader always show exactly the skins the player actually owns.
 */
export function useInventory() {
  const { signedIn, localMode } = useMe();
  const play = usePlay();

  const query = useQuery({
    queryKey: ["inventory"],
    queryFn: () => getInventory() as unknown as Promise<LocalItem[]>,
    enabled: signedIn && !localMode,
  });

  const rows: LocalItem[] = localMode ? play.inventory : ((query.data ?? []) as LocalItem[]);

  return { rows, isLoading: !localMode && query.isLoading, localMode, signedIn };
}
