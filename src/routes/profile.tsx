import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { setTradeUrl } from "@/lib/game.functions";
import { isValidTradeUrl, readTradeUrl, saveTradeUrlLocally } from "@/lib/trade-link";
import { Price } from "@/components/site/Coin";
import { HistoryTabs } from "@/components/site/HistoryTabs";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — CaseForge" },
      { name: "description", content: "Manage your CaseForge balance and your Steam trade link." },
      { property: "og:title", content: "Your profile — CaseForge" },
      {
        property: "og:description",
        content: "Manage your CaseForge balance and your Steam trade link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data, signedIn } = useMe();
  const t = useT();
  const qc = useQueryClient();
  const profile = data?.profile;

  const [localUrl, setLocalUrl] = useState(() => readTradeUrl());
  const savedUrl = profile?.trade_url ?? localUrl;
  const [editing, setEditing] = useState(false);
  const [trade, setTrade] = useState("");

  const saveTrade = useMutation({
    mutationFn: async () => {
      const value = trade.trim();
      if (!isValidTradeUrl(value)) throw new Error("invalid_trade_url");
      // Always keep it locally so the link survives a backend hiccup.
      saveTradeUrlLocally(value);
      try {
        await setTradeUrl({ data: { tradeUrl: value } });
      } catch {
        /* saved locally — the server copy can catch up later */
      }
      return value;
    },
    onSuccess: (value) => {
      setLocalUrl(value);
      toast.success(t("profile.tradeSaved"));
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => toast.error(t("profile.tradeInvalid")),
  });

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">{t("profile.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profile.signInLead")}</p>
        <a
          href="/api/public/auth/steam/login"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t("profile.signIn")}
        </a>
      </main>
    );
  }

  const inputClass =
    "w-full rounded-md border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary";
  const btnClass =
    "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
  const showForm = editing || !savedUrl;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="panel flex flex-wrap items-center gap-4 p-6">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="size-16 rounded-md border object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-md border bg-surface">?</span>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold">{profile?.username ?? "Player"}</h1>
          <p className="text-xs text-muted-foreground">
            {t("profile.level")} {profile?.level ?? 1} · {profile?.xp ?? 0} XP
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("profile.balance")}
          </p>
          <p className="font-display text-xl font-bold text-primary">
            {<Price value={profile?.balance} />}
          </p>
        </div>
      </div>

      <section className="panel space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display font-semibold">{t("profile.tradeTitle")}</h2>
          {savedUrl && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              <Check className="size-3" /> {t("profile.saved")}
            </span>
          )}
        </div>

        {savedUrl && !showForm && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-[240px] flex-1 break-all rounded-md border bg-background/60 px-3 py-2 font-mono text-xs">
              {savedUrl}
            </p>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-surface"
              onClick={() => {
                setTrade(savedUrl);
                setEditing(true);
              }}
            >
              <Pencil className="size-4" /> {t("profile.edit")}
            </button>
          </div>
        )}

        {showForm && (
          <div className="flex flex-wrap gap-2">
            <input
              className={inputClass + " flex-1 min-w-[240px]"}
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              maxLength={255}
            />
            <button
              className={btnClass}
              onClick={() => saveTrade.mutate()}
              disabled={saveTrade.isPending || !trade.trim()}
            >
              {t("profile.save")}
            </button>
            {savedUrl && (
              <button
                className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-surface"
                onClick={() => setEditing(false)}
              >
                {t("profile.cancel")}
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("profile.tradeHint")}</p>
      </section>

      <HistoryTabs />
    </main>
  );
}
