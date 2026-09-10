import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import {
  addLocalBalance,
  addLocalItems,
  bumpNonce,
  logGame,
  logItems,
  newId,
  readLocalBalance,
  removeLocalItems,
  updatePlay,
} from "@/lib/local-play";
import { listTargets, runUpgrade, upgradeChance, HOUSE } from "@/lib/upgrade.functions";
import { SignInButtons } from "@/components/site/SignInButtons";
import { ItemTile } from "@/components/site/ItemTile";
import { InventoryTile, type InvRow } from "@/components/site/InventoryTile";
import { Coin, Price } from "@/components/site/Coin";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/i18n";
import { startTicker } from "@/lib/fx";

export const Route = createFileRoute("/upgrade")({
  validateSearch: (search: Record<string, unknown>): { item?: string } =>
    typeof search["item"] === "string" ? { item: search["item"] } : {},
  head: () => ({
    meta: [
      { title: "Upgrader — CaseForge" },
      {
        name: "description",
        content: "Trade coins or skins for a shot at a bigger CS2 knife, glove or rifle.",
      },
      { property: "og:title", content: "Upgrader — CaseForge" },
      {
        property: "og:description",
        content: "Trade coins or skins for a shot at a bigger CS2 skin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UpgradePage,
});

type Target = {
  id: string;
  name: string;
  image_url: string | null;
  rarity: string;
  base_price: number;
  price_override: number | null;
};

const SPIN_MS = 5200;
const MULTIPLIERS = [2, 4, 8];
const CHANCE_PRESETS = [35, 55, 75];

function UpgradePage() {
  const { signedIn, data: me } = useMe();
  const { item: incomingItem } = Route.useSearch();
  const qc = useQueryClient();
  const t = useT();

  const [mode, setMode] = useState<"balance" | "items">(incomingItem ? "items" : "balance");
  const [risk, setRisk] = useState<"normal" | "gamble">("normal");
  const [stake, setStake] = useState(10);
  const [picked, setPicked] = useState<string[]>(incomingItem ? [incomingItem] : []);
  const [target, setTarget] = useState<Target | null>(null);
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [customChance, setCustomChance] = useState("");
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ won: boolean; chance: number } | null>(null);
  const [spinCfg, setSpinCfg] = useState({ dur: SPIN_MS, ease: "cubic-bezier(0.07, 0.72, 0.06, 1)" });
  const autoBusy = useRef(false);
  const stopTick = useRef<() => void>(() => {});

  const { rows: inventoryRows, localMode } = useInventory();

  const targets = useQuery({
    queryKey: ["upgrade-targets", search],
    queryFn: () => listTargets({ data: { search } }),
    staleTime: 60_000,
  });

  const invRows = inventoryRows as unknown as InvRow[];

  // Most expensive targets first.
  const targetRows = useMemo(
    () =>
      [...((targets.data ?? []) as Target[])].sort(
        (a, b) =>
          Number(b.price_override ?? b.base_price) - Number(a.price_override ?? a.base_price),
      ),
    [targets.data],
  );
  const balance = Number(me?.profile?.balance ?? 0);

  // Keep an item passed in from a case win selected once the inventory arrives.
  useEffect(() => {
    if (!incomingItem) return;
    if (invRows.some((r) => r.id === incomingItem)) {
      setMode("items");
      setPicked((p) => (p.includes(incomingItem) ? p : [incomingItem]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingItem, invRows.length]);

  const pickedRows = invRows.filter((i) => picked.includes(i.id));

  const stakeValue = useMemo(() => {
    if (mode === "balance") return stake;
    return pickedRows.reduce((s, i) => s + Number(i.value), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stake, picked, invRows]);

  const targetValue = target ? Number(target.price_override ?? target.base_price) : 0;
  const chance = upgradeChance(stakeValue, targetValue);
  const multiplier = stakeValue > 0 && targetValue > 0 ? targetValue / stakeValue : 0;
  // The slider never reaches past what the player actually holds.
  const sliderMax = Math.max(1, Math.floor(balance));

  const riskLabel =
    chance <= 0
      ? t("upgrade.noTarget")
      : chance < 0.25
        ? t("risk.low")
        : chance < 0.55
          ? t("risk.medium")
          : chance < 0.8
            ? t("risk.high")
            : t("risk.safe");

  // Gamble mode repaints the wheel and flips the spin direction.
  const gamble = risk === "gamble";
  const winColor = gamble ? "var(--destructive)" : "var(--primary)";
  // Painted sectors only exist while a target is picked / a round is running.
  const armed = Boolean(target) || spinning || Boolean(result);
  const loseColor = gamble
    ? "color-mix(in oklch, var(--destructive) 22%, var(--surface))"
    : "color-mix(in oklch, var(--surface) 85%, transparent)";

  /** Pick the catalog skin whose price lands closest to a desired value. */
  async function pickClosest(desired: number) {
    if (autoBusy.current) return;
    if (stakeValue <= 0) {
      toast.error(t("upgrade.needStake"));
      return;
    }
    autoBusy.current = true;
    try {
      const min = Math.max(stakeValue * 1.02, desired * 0.35);
      const max = desired * 3;
      const rows = (await qc.fetchQuery({
        queryKey: ["upgrade-targets-range", Math.round(min), Math.round(max)],
        queryFn: () => listTargets({ data: { min, max } }),
        staleTime: 60_000,
      })) as Target[];
      const options = rows.filter((r) => Number(r.price_override ?? r.base_price) > stakeValue);
      if (options.length === 0) {
        toast.error(t("upgrade.noMatch"));
        return;
      }
      const best = options.reduce((a, b) =>
        Math.abs(Number(a.price_override ?? a.base_price) - desired) <
        Math.abs(Number(b.price_override ?? b.base_price) - desired)
          ? a
          : b,
      );
      setTarget(best);
      setResult(null);
    } finally {
      autoBusy.current = false;
    }
  }

  const applyChance = (percent: number) => {
    const effective = Math.min(95, Math.max(1, risk === "gamble" ? percent / 2 : percent)) / 100;
    return pickClosest((stakeValue * HOUSE) / effective);
  };
  const applyMultiplier = (m: number) => pickClosest(stakeValue * m);

  const upgrade = useMutation({
    mutationFn: async () => {
      if (!localMode)
        return runUpgrade({
          data:
            mode === "items"
              ? { targetId: target!.id, inventoryIds: picked }
              : { targetId: target!.id, stake: stakeValue },
        });

      const t2 = target!;
      const value = Number(t2.price_override ?? t2.base_price);
      const c = upgradeChance(stakeValue, value);
      const r = Math.random();
      const won = r < c;

      if (mode === "items") removeLocalItems(picked);
      else {
        if (readLocalBalance() < stakeValue) throw new Error(t("upgrade.failed"));
        addLocalBalance(-stakeValue);
      }
      if (won) {
        addLocalItems([
          {
            id: newId(),
            value,
            status: "owned",
            created_at: new Date().toISOString(),
            item: {
              id: t2.id,
              name: t2.name,
              image_url: t2.image_url,
              rarity: t2.rarity,
            },
          },
        ]);
      }
      updatePlay((s) => ({ ...s, upgrades: s.upgrades + 1 }));
      bumpNonce();
      return { won, chance: c, roll: r, stake: stakeValue, target: t2 };
    },
    onMutate: () => {
      setResult(null);
      // Gamble mode spins the wheel the other way round, faster and louder.
      setSpinning(true);
      stopTick.current();
      stopTick.current = startTicker(gamble ? SPIN_MS + 340 : SPIN_MS, gamble);
    },
    onSuccess: (res) => {
      // Land the needle inside the winning arc on a win, outside it on a loss.
      const land = res.won ? res.roll * res.chance : res.chance + res.roll * (1 - res.chance);
      const landDeg = land * 360;
      const dir = risk === "gamble" ? 1 : -1;
      const cur = wheelAngle;
      const mod = (n: number) => ((n % 360) + 360) % 360;
      // Final transform must sit at -landDeg (mod 360) while travelling in `dir`.
      const settle = dir === -1 ? -mod(cur + landDeg) : mod(-landDeg - cur);
      const next = cur + settle + dir * (gamble ? 360 * 9 : 360 * 6);
      const totalMs = gamble ? SPIN_MS + 340 : SPIN_MS;

      if (gamble) {
        // Near-miss: brake hard just short of the sector edge, hang there, then drop in.
        const hold = 300;
        const firstMs = SPIN_MS - 260;
        setSpinCfg({ dur: firstMs, ease: "cubic-bezier(0.02, 0.86, 0.08, 1)" });
        requestAnimationFrame(() => setWheelAngle(next - dir * 13));
        window.setTimeout(() => {
          setSpinCfg({ dur: totalMs - firstMs - hold, ease: "cubic-bezier(0.4, 0, 0.2, 1)" });
          setWheelAngle(next);
        }, firstMs + hold);
      } else {
        setSpinCfg({ dur: SPIN_MS, ease: "cubic-bezier(0.07, 0.72, 0.06, 1)" });
        requestAnimationFrame(() => setWheelAngle(next));
      }

      const tgt = res.target as unknown as {
        name?: string;
        image_url?: string | null;
        rarity?: string;
        base_price?: number;
        price_override?: number | null;
      };
      const wonValue = Number(tgt.price_override ?? tgt.base_price ?? targetValue);

      window.setTimeout(() => {
        // Animation is over: unlock the button so another spin can start at once.
        setSpinning(false);
        setResult({ won: res.won, chance: res.chance });
        setPicked([]);
        if (res.won) setMode("balance");

        // Profile history: every upgrade round, plus the skin when it lands.
        if (res.won) {
          logItems([
            {
              name: String(tgt.name ?? "Skin"),
              image_url: tgt.image_url ?? null,
              rarity: String(tgt.rarity ?? "consumer"),
              value: wonValue,
              source: "upgrade" as const,
            },
          ]);
        }
        logGame({
          game: "upgrade",
          detail: `${tgt.name ?? "Target"} · ${(res.chance * 100).toFixed(1)}%${
            risk === "gamble" ? " · gamble" : ""
          }`,
          stake: Number(res.stake),
          payout: res.won ? wonValue : 0,
          multiplier: Number(res.stake) > 0 ? wonValue / Number(res.stake) : 0,
          won: res.won,
        });

        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["items-history"] });
        qc.invalidateQueries({ queryKey: ["games-history"] });
        if (res.won) toast.success(`${t("upgrade.wonToast")} ${res.target.name}`);
        else toast.error(t("upgrade.lostToast"));
      }, totalMs);
    },
    onError: (e: Error) => {
      stopTick.current();
      setSpinning(false);
      toast.error(e.message || t("upgrade.failed"));
    },
  });

  const canRun = Boolean(target) && stakeValue > 0 && stakeValue < targetValue && !spinning;

  function reset() {
    setPicked([]);
    setTarget(null);
    setResult(null);
    setStake(10);
    setWheelAngle(0);
  }

  const quickBtn =
    "rounded-md border border-border bg-background/60 px-2.5 py-1.5 font-display text-[12px] font-bold uppercase transition-colors hover:bg-surface disabled:opacity-40";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("upgrade.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("upgrade.lead")}</p>

      {!signedIn && (
        <div className="panel mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("upgrade.signIn")}</p>
          <SignInButtons size="lg" />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(220px,270px)_1fr_minmax(220px,270px)]">
        {/* ---------- Left: what you put in ---------- */}
        <div className="panel flex flex-col gap-3 p-4">
          <div className="flex gap-1 rounded-md border border-border bg-background/60 p-1">
            {(
              [
                ["balance", t("upgrade.modeBalance")],
                ["items", t("upgrade.modeItems")],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m as "balance" | "items");
                  setResult(null);
                }}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "hover:bg-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "items" && pickedRows[0] ? (
            <ItemTile
              name={pickedRows[0].item.name}
              image={pickedRows[0].item.image_url}
              rarity={pickedRows[0].item.rarity}
              price={stakeValue}
            />
          ) : (
            <div className="grid place-items-center gap-2 rounded-lg border border-border bg-surface/60 p-6 text-center">
              <Coin className="size-12" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("upgrade.yourStake")}
              </p>
              <p className="font-display text-xl font-bold text-primary">
                <Price value={stakeValue} />
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("upgrade.balanceAmount")}
              </p>
              <input
                type="number"
                min={0}
                max={sliderMax}
                step="0.01"
                inputMode="decimal"
                disabled={mode === "items" || spinning}
                value={mode === "balance" ? String(stake) : "0"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setStake(Math.max(0, Math.min(balance, Number.isFinite(v) ? v : 0)));
                  setResult(null);
                }}
                className="w-24 rounded border border-border bg-background px-2 py-1 text-right font-display text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
            <Slider
              className="mt-3"
              value={[Math.min(stake, sliderMax)]}
              min={0}
              max={sliderMax}
              step={sliderMax > 200 ? 1 : 0.5}
              disabled={mode === "items" || spinning}
              onValueChange={(v) => {
                setStake(v[0] ?? 0);
                setResult(null);
              }}
            />
            <div className="mt-2 grid grid-cols-4 gap-1">
              {([25, 50, 75, 100] as const).map((p) => (
                <button
                  key={p}
                  disabled={mode === "items" || spinning || balance <= 0}
                  onClick={() => {
                    setStake(Math.floor(balance * p) / 100);
                    setResult(null);
                  }}
                  className="rounded-md border border-border bg-background/60 py-1 text-[11px] font-bold uppercase transition-colors hover:bg-surface disabled:opacity-40"
                >
                  {p === 100 ? t("upgrade.max") : `${p}%`}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span className="inline-flex items-center gap-1">
                {t("upgrade.balance")} <Price value={balance} />
              </span>
            </div>
          </div>

          {mode === "items" && signedIn && (
            <div>
              <h2 className="font-display text-xs font-bold uppercase tracking-wide">
                {t("upgrade.yourSkins")}
              </h2>
              <div className="mt-2 grid max-h-[240px] grid-cols-2 gap-2 overflow-y-auto">
                {invRows.map((row) => (
                  <InventoryTile
                    key={row.id}
                    row={row}
                    on={picked.includes(row.id)}
                    onClick={() => {
                      setResult(null);
                      setPicked((p) =>
                        p.includes(row.id) ? p.filter((x) => x !== row.id) : [...p, row.id],
                      );
                    }}
                  />
                ))}
                {invRows.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("upgrade.noSkins")}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Center: wheel + main action ---------- */}
        <div className="panel flex flex-col items-center p-6">
          <div
            className={`relative size-[300px] sm:size-[340px] ${spinning && gamble ? "tension-shake" : ""}`}
          >
            {/* Gamble mode: hotter glow around the wheel. */}
            <div
              className="pointer-events-none absolute -inset-3 rounded-full transition-opacity duration-500"
              style={{
                opacity: gamble ? 1 : 0,
                background:
                  "radial-gradient(circle, color-mix(in oklch, var(--destructive) 28%, transparent) 0%, transparent 68%)",
                animation: spinning && gamble ? "pulse 1.1s ease-in-out infinite" : "none",
              }}
            />
            <div
              className="absolute inset-0 rounded-full border-8 border-surface"
              style={{
                background: armed
                  ? `conic-gradient(from 180deg, ${winColor} 0turn ${chance}turn, ${loseColor} ${chance}turn 1turn)`
                  : "conic-gradient(from 180deg, color-mix(in oklch, var(--surface) 85%, transparent) 0turn 1turn)",
                boxShadow: `0 0 ${gamble ? 90 : 60}px color-mix(in oklch, ${winColor} ${gamble ? 32 : 18}%, transparent)`,
                transform: `rotate(${wheelAngle}deg)`,
                transition: spinning
                  ? `transform ${spinCfg.dur}ms ${spinCfg.ease}`
                  : "none",
              }}
            />
            <div
              className="absolute inset-[26px] grid place-items-center rounded-full border bg-background text-center transition-colors"
              style={{ borderColor: gamble ? winColor : "var(--border)" }}
            >
              <div>
                <p className="font-display text-5xl font-bold" style={{ color: winColor }}>
                  {(chance * 100).toFixed(2)}%
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {riskLabel}
                </p>
                {multiplier > 0 && (
                  <p className="mt-1 font-display text-sm font-bold text-foreground/70">
                    x{multiplier.toFixed(2)}
                  </p>
                )}
                {result && !spinning && (
                  <p
                    className={`mt-2 text-sm font-bold ${result.won ? "text-primary" : "text-destructive"}`}
                  >
                    {result.won ? t("upgrade.win") : t("upgrade.lose")}
                  </p>
                )}
              </div>
            </div>
            {/* Arrow at the bottom of the circle, pointing up at the sector. */}
            <div className="pointer-events-none absolute bottom-[-6px] left-1/2 z-20 -translate-x-1/2">
              <div
                className="size-0"
                style={{
                  borderLeft: "12px solid transparent",
                  borderRight: "12px solid transparent",
                  borderBottom: `22px solid ${winColor}`,
                  filter: `drop-shadow(0 0 10px ${winColor})`,
                }}
              />
            </div>
          </div>

          <button
            onClick={() => upgrade.mutate()}
            disabled={!signedIn || !canRun}
            className="mt-7 w-full rounded-lg bg-primary px-8 py-4 font-display text-lg font-bold uppercase tracking-wide text-primary-foreground shadow-[0_10px_30px_-12px_var(--primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {spinning ? t("upgrade.spinning") : t("upgrade.button")}
          </button>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {t("upgrade.yourStake")} <Price value={stakeValue} className="text-primary" />
            </span>
            <span className="inline-flex items-center gap-1">
              {t("upgrade.target")}{" "}
              {target ? <Price value={targetValue} className="text-primary" /> : "—"}
            </span>
            <button
              onClick={reset}
              disabled={spinning}
              className="underline-offset-4 hover:underline disabled:opacity-40"
            >
              {t("upgrade.reset")}
            </button>
          </div>
        </div>

        {/* ---------- Right: target + quick picks ---------- */}
        <div className="panel flex flex-col gap-3 p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-wide">
            {t("upgrade.pickTarget")}
          </h2>
          {target ? (
            <ItemTile
              name={target.name}
              image={target.image_url}
              rarity={target.rarity}
              price={targetValue}
            />
          ) : (
            <div className="grid place-items-center rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              {t("upgrade.noTarget")}
            </div>
          )}

          <div className="rounded-lg border border-border bg-background/60 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {MULTIPLIERS.map((m) => (
                <button
                  key={m}
                  className={quickBtn}
                  disabled={spinning}
                  onClick={() => void applyMultiplier(m)}
                >
                  x{m}
                </button>
              ))}
              {CHANCE_PRESETS.map((p) => (
                <button
                  key={p}
                  className={quickBtn}
                  disabled={spinning}
                  onClick={() => void applyChance(p)}
                >
                  {p}%
                </button>
              ))}
              <button
                className={`${quickBtn} ml-auto px-2`}
                aria-label={t("upgrade.settings")}
                onClick={() => setShowSettings((v) => !v)}
              >
                <Settings className="size-4" />
              </button>
            </div>
            {showSettings && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
                  {(
                    [
                      ["normal", t("upgrade.riskNormal")],
                      ["gamble", t("upgrade.riskGamble")],
                    ] as const
                  ).map(([r, label]) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRisk(r as "normal" | "gamble");
                        setResult(null);
                      }}
                      className={`flex-1 rounded px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        risk === r ? "bg-primary text-primary-foreground" : "hover:bg-background"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Hand-picked win chance: finds the closest matching target. */}
                <div className="rounded-md border border-border bg-surface p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("upgrade.customChance")}
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={95}
                      inputMode="decimal"
                      value={customChance}
                      onChange={(e) => setCustomChance(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const v = Number(customChance);
                        if (v > 0) void applyChance(v);
                      }}
                      placeholder="50"
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    />
                    <button
                      className={quickBtn}
                      disabled={spinning || !(Number(customChance) > 0)}
                      onClick={() => void applyChance(Number(customChance))}
                    >
                      %
                    </button>
                    <button
                      className={quickBtn}
                      disabled={spinning || !(Number(customChance) > 0)}
                      onClick={() => void applyMultiplier(Number(customChance))}
                      title={t("upgrade.customMultiplier")}
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {t("upgrade.customHint")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("upgrade.search")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto">
            {targetRows.map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setTarget(row as Target);
                  setResult(null);
                }}
                className="text-left"
              >
                <div
                  className="rounded-md border p-1 transition-colors"
                  style={{ borderColor: target?.id === row.id ? "var(--primary)" : "transparent" }}
                >
                  <ItemTile
                    name={row.name}
                    image={row.image_url}
                    rarity={row.rarity}
                    price={Number(row.price_override ?? row.base_price)}
                    compact
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
