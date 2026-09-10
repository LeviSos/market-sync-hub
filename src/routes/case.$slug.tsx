import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCase } from "@/lib/public.functions";
import { openCase, sellItem } from "@/lib/game.functions";
import { useMe } from "@/hooks/useAuth";
import { ItemTile } from "@/components/site/ItemTile";
import { SignInButtons } from "@/components/site/SignInButtons";
import { rarityColor } from "@/lib/rarity";
import { lockLiveDrops, unlockLiveDrops } from "@/lib/live-gate";
import { announceLiveDrop } from "@/lib/live-bus";
import { skinArt, useSkinImages } from "@/hooks/useSkinImages";
import { useT } from "@/lib/i18n";
import { startTicker } from "@/lib/fx";
import {
  addLocalBalance,
  addLocalItems,
  bumpNonce,
  logGame,
  logItems,
  newId,
  readLocalBalance,
  readPlay,
  removeLocalItems,
  updatePlay,
  weightedPick,
} from "@/lib/local-play";
import { Price } from "@/components/site/Coin";
import { casePrice, type PoolRow } from "@/lib/pricing";

export const Route = createFileRoute("/case/$slug")({
  head: () => ({
    meta: [
      { title: "Open a case — CaseForge" },
      {
        name: "description",
        content: "Spin this CS2 case with a provably fair roll and keep whatever drops.",
      },
      { property: "og:title", content: "Open a case — CaseForge" },
      {
        property: "og:description",
        content: "Spin this CS2 case with a provably fair roll and keep whatever drops.",
      },
    ],
  }),
  component: CasePage,
});

type PoolItem = {
  id: string;
  name: string;
  image_url: string | null;
  rarity: string;
  base_price: number;
};

type Won = { item: PoolItem; value: number; inventoryId: string; sold?: boolean };

const TILE = 132;
const STRIP = 60;
// The reel is pre-scrolled a few tiles in, so it is already filled from the left
// edge and glides on from there instead of spawning with a tile parked under the
// marker.
const START = TILE * 4;

function CasePage() {
  const { slug } = Route.useParams();
  const { signedIn, localMode } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: art } = useSkinImages();
  const t = useT();

  const [count, setCount] = useState(1);
  const [spinning, setSpinning] = useState(false);
  // `animate` gates the CSS transition so the reel can be snapped back to its
  // off-screen start position instantly before each spin.
  const [animate, setAnimate] = useState(false);
  const [offset, setOffset] = useState(START);
  const [strips, setStrips] = useState<PoolItem[][]>([]);
  const [won, setWon] = useState<Won[] | null>(null);
  // Every spin brakes a little differently and stops slightly off-centre.
  const [reelEase, setReelEase] = useState("cubic-bezier(0.12, 0.7, 0.1, 1)");
  const spinRef = useRef(0);
  const stopTick = useRef<() => void>(() => {});

  const { data, isLoading } = useQuery({
    queryKey: ["case", slug],
    queryFn: () => getCase({ data: { slug } }),
    staleTime: 60_000,
  });

  const pool = useMemo(() => {
    const rows = (data?.pool ?? []) as unknown as { weight: number; item: PoolItem }[];
    return rows.filter((r) => r.item);
  }, [data]);

  const totalWeight = pool.reduce((s, p) => s + p.weight, 0);

  const sell = useMutation({
    mutationFn: async (inventoryId: string) => {
      if (localMode) {
        const row = readPlay().inventory.find((i) => i.id === inventoryId);
        const amount = Number(row?.value ?? 0);
        removeLocalItems([inventoryId]);
        addLocalBalance(amount);
        return { amount };
      }
      return sellItem({ data: { inventoryId } });
    },
    onSuccess: (res, inventoryId) => {
      setWon((w) =>
        w ? w.map((x) => (x.inventoryId === inventoryId ? { ...x, sold: true } : x)) : w,
      );
      toast.success(
        <span className="inline-flex items-center gap-1">
          {t("case.soldFor")} <Price value={res.amount} />
        </span>,
      );
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message || t("case.sellError")),
  });

  const spin = useMutation({
    mutationFn: async () => {
      if (!localMode) return openCase({ data: { caseSlug: slug, count } });

      const price = casePrice(data?.kase?.price, pool as unknown as PoolRow[]);
      const cost = price * count;
      if (readLocalBalance() < cost) throw new Error(t("case.openError"));

      const rows = pool;
      const results = Array.from({ length: count }, () => {
        const item = weightedPick(rows) ?? rows[0]?.item;
        const value = Number(
          (item as unknown as { price_override?: number; base_price?: number })?.price_override ??
            (item as unknown as { base_price?: number })?.base_price ??
            0,
        );
        return { item: item as PoolItem, value, inventoryId: newId() };
      });

      addLocalBalance(-cost);
      addLocalItems(
        results.map((r) => ({
          id: r.inventoryId,
          value: r.value,
          status: "owned",
          created_at: new Date().toISOString(),
          item: {
            id: String((r.item as unknown as { id?: string }).id ?? r.inventoryId),
            name: String((r.item as unknown as { name?: string }).name ?? "Skin"),
            image_url:
              ((r.item as unknown as { image_url?: string | null }).image_url ?? null) || null,
            rarity: String((r.item as unknown as { rarity?: string }).rarity ?? "consumer"),
          },
        })),
      );
      updatePlay((s) => ({ ...s, opened: s.opened + count }));
      bumpNonce();
      return { results };
    },
    onMutate: () => {
      setWon(null);
      setSpinning(true);
      setAnimate(false);
      setOffset(START);
      stopTick.current();
      stopTick.current = startTicker(5200);
      lockLiveDrops();
    },
    onSuccess: (res) => {
      const results = res.results;
      const items = pool.map((p) => p.item);
      const built = results.map((r) => {
        const filler = Array.from(
          { length: STRIP },
          () => items[Math.floor(Math.random() * items.length)] as PoolItem,
        );
        filler[STRIP - 5] = r.item as unknown as PoolItem;
        return filler;
      });
      setStrips(built);
      spinRef.current += 1;
      // Overshoot-style braking, picked at random, plus an off-centre finish.
      const eases = [
        "cubic-bezier(0.08, 0.85, 0.12, 1.02)",
        "cubic-bezier(0.2, 0.9, 0.05, 1.015)",
        "cubic-bezier(0.05, 0.6, 0.1, 1)",
      ];
      setReelEase(eases[Math.floor(Math.random() * eases.length)] as string);
      const jitter = Math.round((Math.random() - 0.5) * TILE * 0.52);
      // Two frames: the first paints the reel parked off-screen to the left with
      // no transition, the second turns the transition on and slides it in.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setAnimate(true);
          setOffset((STRIP - 5) * TILE + jitter);
        }),
      );
      window.setTimeout(() => {
        setSpinning(false);
        setWon(
          results.map((r) => ({
            item: r.item as unknown as PoolItem,
            value: r.value,
            inventoryId: r.inventoryId,
          })),
        );
        // Profile history: what dropped and how the round went.
        const spent = casePrice(data?.kase?.price, pool as unknown as PoolRow[]) * count;
        const payout = results.reduce((s, r) => s + Number(r.value), 0);
        logItems(
          results.map((r) => ({
            name: String((r.item as unknown as { name?: string })?.name ?? "Skin"),
            image_url: (r.item as unknown as { image_url?: string | null })?.image_url ?? null,
            rarity: String((r.item as unknown as { rarity?: string })?.rarity ?? "consumer"),
            value: Number(r.value),
            source: "case" as const,
          })),
        );
        logGame({
          game: "case",
          detail: `${data?.kase?.name ?? "Case"} ×${count}`,
          stake: spent,
          payout,
          multiplier: spent > 0 ? payout / spent : 0,
          won: payout >= spent,
        });
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["inventory"] });
        // Only now does the drop reach the live feed — here and for everyone else.
        unlockLiveDrops();
        qc.invalidateQueries({ queryKey: ["live-drops"] });
        announceLiveDrop();
      }, 5200);
    },
    onError: (e: Error) => {
      setSpinning(false);
      stopTick.current();
      unlockLiveDrops();
      toast.error(e.message || t("case.openError"));
    },
  });

  if (isLoading)
    return (
      <main className="px-4 py-16 text-center text-sm text-muted-foreground">
        {t("case.loading")}
      </main>
    );
  if (!data) {
    return (
      <main className="px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">{t("case.notFound")}</h1>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
          {t("case.backToCases")}
        </Link>
      </main>
    );
  }

  const kase = data.kase;
  const price = casePrice(kase.price, pool as unknown as PoolRow[]);
  const cost = price * count;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        {t("case.back")}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{kase.name}</h1>
      <p className="text-sm text-muted-foreground">
        {kase.category} · {<Price value={price} />} {t("case.perOpen")}
      </p>

      <div className="panel mt-6 overflow-hidden p-4">
        <div className={`grid gap-3 ${strips.length > 1 ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {(strips.length ? strips : [pool.map((p) => p.item)]).map((strip, si) => (
            <div
              key={si}
              className="relative h-[150px] overflow-hidden rounded-lg border bg-background/60"
            >
              <div
                className={`pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_18px_var(--primary)] ${
                  spinning ? "marker-flare" : ""
                }`}
              />
              <div
                className="absolute left-1/2 top-3 flex"
                style={{
                  transform: `translateX(calc(-${offset}px - ${TILE / 2}px))`,
                  transition: animate ? `transform 5s ${reelEase}` : "none",
                }}
              >
                {strip.map((item, i) => {
                  const src = skinArt(art, item?.name, item?.image_url);
                  return (
                    <div key={`${si}-${i}`} className="w-[132px] shrink-0 px-1.5">
                      <div
                        className="flex h-[126px] flex-col items-center justify-center rounded-md border bg-surface p-2"
                        style={{
                          borderColor: `color-mix(in oklch, ${rarityColor(item?.rarity ?? "consumer")} 55%, transparent)`,
                        }}
                      >
                        {src ? (
                          <img src={src} alt="" className="h-16 object-contain" />
                        ) : (
                          <span className="text-3xl opacity-30">✦</span>
                        )}
                        <p className="mt-1 w-full truncate text-center text-[10px]">{item?.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <div className="flex gap-1 rounded-md border bg-background/60 p-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                disabled={spinning}
                className={`size-9 rounded text-sm font-semibold transition-colors ${
                  count === n ? "bg-primary text-primary-foreground" : "hover:bg-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {signedIn ? (
            <button
              onClick={() => spin.mutate()}
              disabled={spinning || spin.isPending}
              className="rounded-md bg-primary px-8 py-3 font-display text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {spinning ? (
                t("case.opening")
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {t("case.open")} {count} {t("case.for")} <Price value={cost} />
                </span>
              )}
            </button>
          ) : (
            <SignInButtons size="lg" />
          )}
        </div>
      </div>

      {won && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden p-0"
            style={{ animation: "drop-in 300ms ease-out" }}
          >
            <h2 className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 text-center font-display text-2xl font-bold backdrop-blur">
              {t("case.yourDrop")}
            </h2>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                className={`grid gap-3 ${
                  won.length > 1
                    ? "grid-cols-2 sm:grid-cols-3"
                    : "grid-cols-1 max-w-[280px] mx-auto"
                }`}
              >
                {won.map((w) => (
                  <div key={w.inventoryId} className="flex flex-col gap-1.5">
                    <ItemTile
                      name={w.item.name}
                      image={w.item.image_url}
                      rarity={w.item.rarity}
                      price={w.value}
                      compact={won.length > 1}
                    />
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => sell.mutate(w.inventoryId)}
                        disabled={w.sold || sell.isPending}
                        className="rounded-md bg-primary px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {w.sold ? t("case.sold") : t("case.sell")}
                      </button>
                      <button
                        onClick={() =>
                          navigate({ to: "/upgrade", search: { item: w.inventoryId } })
                        }
                        disabled={w.sold}
                        className="rounded-md border border-border bg-surface px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors hover:border-primary/60 disabled:opacity-50"
                      >
                        {t("case.toUpgrade")}
                      </button>
                      <button
                        onClick={() =>
                          navigate({ to: "/contracts", search: { item: w.inventoryId } })
                        }
                        disabled={w.sold}
                        className="rounded-md border border-border bg-surface px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors hover:border-primary/60 disabled:opacity-50"
                      >
                        {t("case.toContract")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap justify-center gap-3 border-t border-border bg-background/95 px-6 py-4 backdrop-blur">
              <button
                onClick={() => setWon(null)}
                className="rounded-md border bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2"
              >
                {t("case.close")}
              </button>
              <button
                onClick={() => {
                  won.filter((w) => !w.sold).forEach((w) => sell.mutate(w.inventoryId));
                }}
                disabled={sell.isPending || won.every((w) => w.sold)}
                className="rounded-md border border-primary/50 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
              >
                {t("drop.sellAll")}
              </button>
              <button
                onClick={() => {
                  setWon(null);
                  spin.mutate();
                }}
                disabled={spinning || spin.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("case.again")} · <Price value={cost} />
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="mt-10 font-display text-xl font-bold">{t("case.inside")}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {pool
          .slice()
          .sort((a, b) => Number(b.item.base_price) - Number(a.item.base_price))
          .map((p) => (
            <ItemTile
              key={p.item.id}
              name={p.item.name}
              image={p.item.image_url}
              rarity={p.item.rarity}
              price={Number(p.item.base_price)}
              chance={totalWeight ? (p.weight / totalWeight) * 100 : null}
            />
          ))}
      </div>
    </main>
  );
}
