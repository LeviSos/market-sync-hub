import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMe } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import {
  addLocalItems,
  newId,
  removeLocalItems,
  bumpNonce,
  logGame,
  logItems,
} from "@/lib/local-play";
import { runContract, CONTRACT_MIN, CONTRACT_MAX } from "@/lib/contract.functions";
import { SignInButtons } from "@/components/site/SignInButtons";
import { ItemTile } from "@/components/site/ItemTile";
import { InventoryTile } from "@/components/site/InventoryTile";
import { money } from "@/lib/rarity";
import { Price } from "@/components/site/Coin";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/contracts")({
  validateSearch: (search: Record<string, unknown>): { item?: string } =>
    typeof search["item"] === "string" ? { item: search["item"] } : {},
  head: () => ({
    meta: [
      { title: "Contracts — CaseForge" },
      {
        name: "description",
        content: "Melt 3 to 10 CS2 skins into one bigger drop with a provably fair contract.",
      },
      { property: "og:title", content: "Contracts — CaseForge" },
      { property: "og:description", content: "Melt 3 to 10 CS2 skins into one bigger drop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const t = useT();
  const { signedIn } = useMe();
  const { item: incomingItem } = Route.useSearch();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>(incomingItem ? [incomingItem] : []);
  const [forging, setForging] = useState(false);
  const [out, setOut] = useState<{
    name: string;
    image_url: string | null;
    rarity: string;
    value: number;
    input: number;
  } | null>(null);

  const { rows, localMode } = useInventory();

  // Keep an item passed in from a case win selected once the inventory arrives.
  useEffect(() => {
    if (!incomingItem) return;
    if (rows.some((r) => r.id === incomingItem)) {
      setPicked((p) => (p.includes(incomingItem) ? p : [incomingItem, ...p].slice(0, 10)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingItem, rows.length]);

  const input = useMemo(
    () => rows.filter((r) => picked.includes(r.id)).reduce((s, r) => s + Number(r.value), 0),
    [rows, picked],
  );

  const forge = useMutation({
    mutationFn: async () => {
      if (!localMode) return runContract({ data: { inventoryIds: picked } });

      const used = rows.filter((r) => picked.includes(r.id));
      const inputValue = used.reduce((s, r) => s + Number(r.value), 0);
      const factor = CONTRACT_MIN + Math.random() * (CONTRACT_MAX - CONTRACT_MIN);
      const output = Math.round(inputValue * factor * 100) / 100;
      const base = used[Math.floor(Math.random() * used.length)]!;
      const item = {
        id: newId(),
        name: base.item?.name ?? "Contract skin",
        image_url: base.item?.image_url ?? null,
        rarity: base.item?.rarity ?? "restricted",
      };
      removeLocalItems(picked);
      addLocalItems([
        { id: newId(), value: output, status: "owned", created_at: new Date().toISOString(), item },
      ]);
      bumpNonce();
      return { item, output, input: inputValue };
    },
    onMutate: () => {
      setOut(null);
      setForging(true);
    },
    onSuccess: (res) => {
      window.setTimeout(() => {
        setForging(false);
        setOut({
          name: res.item.name,
          image_url: res.item.image_url,
          rarity: res.item.rarity,
          value: res.output,
          input: res.input,
        });
        setPicked([]);
        logItems([
          {
            name: res.item.name,
            image_url: res.item.image_url ?? null,
            rarity: res.item.rarity,
            value: res.output,
            source: "contract",
          },
        ]);
        logGame({
          game: "contract",
          detail: res.item.name,
          stake: res.input,
          payout: res.output,
          multiplier: res.input > 0 ? res.output / res.input : 0,
          won: res.output >= res.input,
        });
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["me"] });
        if (res.output >= res.input) toast.success(t("contracts.paid"));
      }, 1800);
    },
    onError: (e: Error) => {
      setForging(false);
      toast.error(e.message || t("contracts.error"));
    },
  });

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("contracts.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("contracts.lead")} {Math.round(CONTRACT_MIN * 100)}% – {Math.round(CONTRACT_MAX * 100)}%
      </p>

      {!signedIn ? (
        <div className="panel mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("contracts.signIn")}</p>
          <SignInButtons size="lg" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="panel p-4">
            <h2 className="font-display text-sm font-bold">
              {t("contracts.yourItems")} ({rows.length})
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {rows.map((row) => (
                <InventoryTile
                  key={row.id}
                  row={row}
                  on={picked.includes(row.id)}
                  onClick={() =>
                    setPicked((p) => {
                      if (p.includes(row.id)) return p.filter((x) => x !== row.id);
                      if (p.length >= 10) return p;
                      return [...p, row.id];
                    })
                  }
                />
              ))}
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("contracts.empty")}</p>
              )}
            </div>
          </div>

          <div className="panel flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("contracts.label")}
            </p>
            <p className="font-display text-3xl font-bold text-primary">
              {<Price value={input} />}
            </p>
            <p className="text-xs text-muted-foreground">
              {picked.length} / 10 {t("contracts.selected")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("contracts.range")} {<Price value={input * CONTRACT_MIN} />} –{" "}
              {<Price value={input * CONTRACT_MAX} />}
            </p>
            <button
              onClick={() => forge.mutate()}
              disabled={picked.length < 3 || forging || forge.isPending}
              className="mt-2 w-full rounded-md bg-primary px-6 py-3 font-display text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {forging ? t("contracts.forging") : t("contracts.forge")}
            </button>

            {out && (
              <div className="mt-4 w-full" style={{ animation: "drop-in 300ms ease-out" }}>
                <ItemTile
                  name={out.name}
                  image={out.image_url}
                  rarity={out.rarity}
                  price={out.value}
                />
                <p
                  className={`mt-2 text-sm font-semibold ${out.value >= out.input ? "text-primary" : "text-destructive"}`}
                >
                  {out.value >= out.input ? "+" : ""}
                  {<Price value={out.value - out.input} />}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
