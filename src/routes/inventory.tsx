import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sellItem, sellAllItems, requestWithdrawal, listWithdrawals } from "@/lib/game.functions";
import { useMe } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import { addLocalBalance, readPlay, removeLocalItems } from "@/lib/local-play";
import { ItemTile } from "@/components/site/ItemTile";
import { SignInButtons } from "@/components/site/SignInButtons";
import { Price } from "@/components/site/Coin";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Your inventory — CaseForge" },
      {
        name: "description",
        content: "Every skin you've unboxed on CaseForge, with instant sell-back prices.",
      },
      { property: "og:title", content: "Your inventory — CaseForge" },
      {
        property: "og:description",
        content: "Every skin you've unboxed on CaseForge, with instant sell-back prices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { signedIn } = useMe();
  const qc = useQueryClient();
  const t = useT();
  const [saleOnly, setSaleOnly] = useState(false);

  const { rows: data, isLoading, localMode } = useInventory();

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
    onSuccess: (res) => {
      toast.success(
        <span className="inline-flex items-center gap-1">
          {t("inv.soldFor")} <Price value={res.amount} />
        </span>,
      );
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => toast.error(t("inv.sellError")),
  });

  const sellAll = useMutation({
    mutationFn: async () => {
      if (localMode) {
        const rows = readPlay().inventory;
        const amount = rows.reduce((s, i) => s + Number(i.value), 0);
        removeLocalItems(rows.map((i) => i.id));
        addLocalBalance(amount);
        return { sold: rows.length, amount };
      }
      return sellAllItems();
    },
    onSuccess: (res) => {
      if (!res.sold) toast.success(t("inv.nothingToSell"));
      else
        toast.success(
          <span className="inline-flex items-center gap-1">
            {t("inv.soldMany")} {res.sold} · <Price value={res.amount} />
          </span>,
        );
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => toast.error(t("inv.sellAllError")),
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["withdrawals"],
    queryFn: () => listWithdrawals(),
    enabled: signedIn && !localMode,
  });

  const withdraw = useMutation({
    mutationFn: (inventoryId: string) => requestWithdrawal({ data: { inventoryId } }),
    onSuccess: () => {
      toast.success(t("inv.withdrawRequested"));
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message || t("inv.withdrawError")),
  });

  const tradeUrl = useMe().data?.profile?.trade_url ?? null;

  const items = useMemo(() => data ?? [], [data]);
  const visible = useMemo(
    () => (saleOnly ? items.filter((i) => Number(i.value) > 0) : items),
    [items, saleOnly],
  );
  const total = items.reduce((s, i) => s + Number(i.value), 0);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">{t("inv.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("inv.signInLead")}</p>
        <div className="mt-6 flex justify-center">
          <SignInButtons size="lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t("inv.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} {t("inv.owned")}
          </p>
        </div>
        <div className="panel px-4 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("inv.total")}
          </p>
          <p className="font-display text-lg font-bold text-primary">
            <Price value={total} />
          </p>
        </div>
      </div>

      <div className="panel mt-6 flex flex-wrap items-center gap-3 p-2">
        <label className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground">
          <Switch checked={saleOnly} onCheckedChange={setSaleOnly} />
          {t("inv.saleOnly")}
        </label>
        <button
          onClick={() => sellAll.mutate()}
          disabled={sellAll.isPending || items.length === 0}
          className="ml-auto rounded-md bg-primary px-3 py-2 font-display text-[13px] font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sellAll.isPending ? t("inv.selling") : t("inv.sellAll")}
        </button>
      </div>

      {isLoading && <p className="mt-10 text-sm text-muted-foreground">{t("inv.loading")}</p>}
      {!isLoading && visible.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">{t("inv.empty")}</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((row) => {
          const item = row.item as unknown as {
            name: string;
            image_url: string | null;
            rarity: string;
          } | null;
          return (
            <div key={row.id} className="space-y-2">
              <ItemTile
                name={item?.name ?? "Unknown skin"}
                image={item?.image_url ?? null}
                rarity={item?.rarity ?? "consumer"}
                price={Number(row.value)}
              />
              <button
                onClick={() => sell.mutate(row.id)}
                disabled={sell.isPending}
                className="inline-flex w-full items-center justify-center gap-1 rounded-md border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
              >
                {t("inv.sellFor")} <Price value={row.value} />
              </button>
              <button
                onClick={() => withdraw.mutate(row.id)}
                disabled={withdraw.isPending || !tradeUrl}
                title={tradeUrl ? t("inv.withdrawTitle") : t("inv.withdrawNeedLink")}
                className="w-full rounded-md border border-secondary/40 px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-40"
              >
                {t("inv.withdraw")}
              </button>
            </div>
          );
        })}
      </div>

      {!tradeUrl && items.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/profile" className="text-primary underline-offset-4 hover:underline">
            {t("inv.tradeHint")}
          </Link>
        </p>
      )}

      {(withdrawals ?? []).length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold tracking-tight">{t("inv.withdrawals")}</h2>
          <div className="mt-4 space-y-2">
            {(withdrawals ?? []).map((w) => {
              const item = w.item as unknown as { name: string } | null;
              return (
                <div
                  key={w.id}
                  className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="font-semibold">{item?.name ?? "Skin"}</span>
                  <span className="text-muted-foreground">
                    <Price value={w.value} />
                  </span>
                  <span
                    className={
                      w.status === "sent"
                        ? "font-display text-xs uppercase text-success"
                        : w.status === "pending"
                          ? "font-display text-xs uppercase text-secondary"
                          : "font-display text-xs uppercase text-muted-foreground"
                    }
                  >
                    {w.status}
                  </span>
                  {w.note && <span className="w-full text-xs text-muted-foreground">{w.note}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
