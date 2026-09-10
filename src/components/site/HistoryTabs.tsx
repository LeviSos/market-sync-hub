/**
 * INVENTORY / ITEMS HISTORY / GAMES HISTORY tabs shown on the profile page.
 *
 * Reads the saved history from the backend when the player has a real session
 * and falls back to (or merges with) the local play log, which also records
 * rounds the backend does not store on its own (cases, contracts, upgrades).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Package, Swords } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import { usePlay } from "@/lib/local-play";
import { itemsHistory, gamesHistory } from "@/lib/game.functions";
import { Price } from "@/components/site/Coin";
import { rarityColor } from "@/lib/rarity";
import { useSkinImage } from "@/hooks/useSkinImages";
import { useT } from "@/lib/i18n";

type Row = {
  id: string;
  name: string;
  image_url: string | null;
  rarity: string;
  value: number;
  source: string;
  created_at: string;
};

type Game = {
  id: string;
  game: string;
  detail: string;
  stake: number;
  payout: number;
  won: boolean;
  created_at: string;
};

const tabBase =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-display text-[13px] font-bold uppercase tracking-wide transition-colors";

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function HistoryCard({ row, label }: { row: Row; label: string }) {
  const src = useSkinImage(row.name, row.image_url);
  return (
    <div
      className="rounded-lg border bg-surface/60 p-3"
      style={{ borderColor: rarityColor(row.rarity) }}
    >
      <div className="grid h-24 place-items-center">
        {src ? (
          <img src={src} alt={row.name} className="max-h-24 max-w-full object-contain" />
        ) : (
          <span className="text-3xl opacity-30">✦</span>
        )}
      </div>
      <p className="mt-2 truncate text-xs font-semibold" title={row.name}>
        {row.name}
      </p>
      <p className="mt-1 font-display text-sm font-bold text-primary">
        <Price value={row.value} />
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label} · {when(row.created_at)}
      </p>
    </div>
  );
}

export function HistoryTabs() {
  const { signedIn } = useMe();
  const { localMode } = useInventory();
  const play = usePlay();
  const t = useT();
  const [tab, setTab] = useState<"items" | "games">("items");

  const gameLabel = (key: string) =>
    key === "case"
      ? t("game.case")
      : key === "upgrade"
        ? t("game.upgrade")
        : key === "contract"
          ? t("game.contract")
          : key === "battle"
            ? t("game.battle")
            : key;

  const drops = useQuery({
    queryKey: ["items-history"],
    queryFn: () => itemsHistory(),
    enabled: signedIn && !localMode,
  });
  const games = useQuery({
    queryKey: ["games-history"],
    queryFn: () => gamesHistory(),
    enabled: signedIn && !localMode,
  });

  const itemRows: Row[] = useMemo(() => {
    const local: Row[] = play.itemsHistory.map((h) => ({
      id: h.id,
      name: h.name,
      image_url: h.image_url,
      rarity: h.rarity,
      value: Number(h.value),
      source: h.source,
      created_at: h.created_at,
    }));
    if (localMode) return local;
    const server: Row[] = (drops.data ?? []).map((r) => {
      const item = r.item as unknown as {
        name?: string;
        image_url?: string | null;
        rarity?: string;
      } | null;
      return {
        id: String(r.id),
        name: item?.name ?? "Skin",
        image_url: item?.image_url ?? null,
        rarity: item?.rarity ?? "consumer",
        value: Number(r.value),
        source: "case",
        created_at: String(r.created_at),
      };
    });
    // The backend stores case drops; upgrades/contracts come from the play log.
    return [...server, ...local.filter((l) => l.source !== "case")].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    );
  }, [play.itemsHistory, drops.data, localMode]);

  const gameRows: Game[] = useMemo(() => {
    const local: Game[] = play.gamesHistory.map((g) => ({
      id: g.id,
      game: g.game,
      detail: g.detail,
      stake: Number(g.stake),
      payout: Number(g.payout),
      won: g.won,
      created_at: g.created_at,
    }));
    if (localMode) return local;
    const server: Game[] = (games.data ?? []).map((r) => {
      const target = r.target as unknown as { name?: string } | null;
      return {
        id: String(r.id),
        game: "upgrade",
        detail: `${target?.name ?? "Target"} · ${(Number(r.chance) * 100).toFixed(1)}%`,
        stake: Number(r.stake),
        payout: r.won ? Number(r.target_value) : 0,
        won: Boolean(r.won),
        created_at: String(r.created_at),
      };
    });
    return [...server, ...local.filter((l) => l.game !== "upgrade")].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    );
  }, [play.gamesHistory, games.data, localMode]);

  const on = (active: boolean) =>
    active
      ? `${tabBase} bg-primary text-primary-foreground`
      : `${tabBase} text-muted-foreground hover:text-foreground`;

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap gap-1">
        <Link to="/inventory" className={on(false)}>
          <Package className="size-4" /> {t("hist.inventory")}
        </Link>
        <button className={on(tab === "items")} onClick={() => setTab("items")}>
          <Clock className="size-4" /> {t("hist.items")}
        </button>
        <button className={on(tab === "games")} onClick={() => setTab("games")}>
          <Swords className="size-4" /> {t("hist.games")}
        </button>
      </div>

      {tab === "items" && (
        <div className="mt-4">
          {itemRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hist.emptyItems")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {itemRows.map((row) => (
                <HistoryCard key={row.id} row={row} label={gameLabel(row.source)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "games" && (
        <div className="mt-4 space-y-2">
          {gameRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hist.emptyGames")}</p>
          ) : (
            gameRows.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface/60 px-4 py-3 text-sm"
              >
                <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
                  {gameLabel(g.game)}
                </span>
                <span className="font-semibold">{g.detail}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {t("hist.stake")} <Price value={g.stake} />
                </span>
                <span
                  className={
                    g.won
                      ? "ml-auto font-display text-xs uppercase text-success"
                      : "ml-auto font-display text-xs uppercase text-destructive"
                  }
                >
                  {g.won ? t("hist.won") : t("hist.lost")}
                </span>
                <span className="font-display text-sm font-bold text-primary">
                  <Price value={g.payout} />
                </span>
                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                  {when(g.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
