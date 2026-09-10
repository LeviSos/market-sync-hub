import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveDrops } from "@/lib/public.functions";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { loose } from "@/lib/supabase-loose";

const supabase = loose(typedSupabase);
import { rarityColor } from "@/lib/rarity";
import { liveDropsLocked, onLiveDropsUnlock } from "@/lib/live-gate";
import { onLiveDropAnnounce } from "@/lib/live-bus";
import { skinArt, useSkinImages } from "@/hooks/useSkinImages";
import { useT } from "@/lib/i18n";
import { Price } from "@/components/site/Coin";

/** Safety net: if a broadcast is lost, the row still shows up after the reel time. */
const FALLBACK_DELAY = 6_000;

export function LiveDrops() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["live-drops"],
    queryFn: () => liveDrops(),
    staleTime: 5_000,
  });
  const { data: art } = useSkinImages();
  const pending = useRef(false);
  const t = useT();

  useEffect(() => {
    const timers = new Set<number>();
    const flush = () => {
      pending.current = false;
      qc.invalidateQueries({ queryKey: ["live-drops"] });
    };
    const request = () => {
      // Never interrupt a running animation on this tab.
      if (liveDropsLocked()) pending.current = true;
      else flush();
    };
    const off = onLiveDropsUnlock(() => {
      if (pending.current) flush();
    });
    // Other players announce their drop only after their reel has stopped.
    const offBus = onLiveDropAnnounce(request);
    const channel = supabase
      .channel("live-drops")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "case_openings" }, () => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          request();
        }, FALLBACK_DELAY);
        timers.add(id);
      })
      .subscribe();
    return () => {
      off();
      offBus();
      timers.forEach((id) => window.clearTimeout(id));
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const drops = data ?? [];

  // Exactly one pinned slot: the single most valuable drop of the last 24h.
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const top = drops
    .filter((d) => new Date(d.created_at).getTime() >= since)
    .reduce<(typeof drops)[number] | null>(
      (best, d) => (!best || Number(d.value) > Number(best.value) ? d : best),
      null,
    );
  const feed = top ? drops.filter((d) => d.id !== top.id) : drops;

  const artOf = (d: (typeof drops)[number]) => skinArt(art, d.item?.name, d.item?.image_url);

  return (
    <aside className="border-b border-border bg-background/80 lg:fixed lg:bottom-0 lg:left-0 lg:top-[60px] lg:w-[180px] lg:border-b-0 lg:border-r">
      <div className="rail-scroll flex gap-2 overflow-x-auto px-3 py-2 lg:h-full lg:flex-col lg:gap-0 lg:overflow-y-auto lg:px-0 lg:py-0">
        {top && (
          <div
            key={top.id}
            className="sticky left-0 top-0 z-20 flex w-[190px] shrink-0 flex-col gap-1 rounded-md px-2.5 py-2 lg:w-full lg:rounded-none"
            style={{
              background:
                "linear-gradient(140deg, rgba(245,192,36,0.22), rgba(245,192,36,0.05) 70%), var(--color-background)",
              border: "1px solid rgba(245,192,36,0.75)",
              boxShadow: "0 0 22px -6px rgba(245,192,36,0.7)",
            }}
          >
            <span
              className="w-fit rounded px-1.5 py-[2px] font-display text-[9px] font-bold uppercase tracking-wide text-black"
              style={{ background: "linear-gradient(180deg,#ffe27a,#f5c024)" }}
            >
              {t("drop.top")}
            </span>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[12px] font-semibold tracking-wide">
                  {top.item?.name}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {top.username} · <span className="text-primary">{<Price value={top.value} />}</span>
                </p>
              </div>
              {artOf(top) ? (
                <img src={artOf(top)!} alt="" className="size-10 shrink-0 object-contain" />
              ) : (
                <span className="size-10 shrink-0 text-center leading-10 opacity-40">✦</span>
              )}
            </div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {t("live.top24h")}
            </p>
          </div>
        )}

        {drops.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">{t("live.empty")}</p>
        )}

        {feed.map((d) => {
          const color = rarityColor(d.item?.rarity ?? "consumer");
          return (
            <div
              key={d.id}
              className="live-drop-in relative flex w-[180px] shrink-0 items-center gap-2 overflow-hidden px-2.5 py-1.5 lg:w-full lg:border-b lg:border-border/60"
              style={{
                background: `linear-gradient(100deg, color-mix(in oklab, ${color} 26%, transparent), transparent 78%)`,
              }}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
              <div className="min-w-0 flex-1">
                <p className="max-w-[104px] truncate font-display text-[12px] font-semibold tracking-wide">
                  {d.item?.name}
                </p>
                <p className="max-w-[104px] truncate text-[10px] text-muted-foreground">
                  {d.username} · <span className="text-primary">{<Price value={d.value} />}</span>
                </p>
              </div>
              {artOf(d) ? (
                <img src={artOf(d)!} alt="" className="size-8 shrink-0 object-contain" />
              ) : (
                <span className="size-8 shrink-0 text-center leading-8 opacity-40">✦</span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

