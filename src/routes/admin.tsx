import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { money } from "@/lib/rarity";
import { setBalanceOverride, useBalanceOverrides } from "@/lib/admin-balances";
import { deleteLocalMessage, readFlags, setLocalFlags, usePlay } from "@/lib/local-play";
import { Price } from "@/components/site/Coin";
import { useT } from "@/lib/i18n";
import { marketSync } from "@/lib/market.functions";
import { uploadCaseCover } from "@/lib/covers.functions";
import { CaseCover, useCoverUrl } from "@/components/site/CaseCover";
import { computeCasePrice } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { SessionExpiredError, withFreshSession } from "@/lib/session-guard";
import { Skeleton } from "@/components/ui/skeleton";


import {
  amIStaff,
  adminStats,
  adminListUsers,
  adminAdjustBalance,
  adminSetFlags,
  adminListChat,
  adminDeleteChat,
  adminWithdrawals,
  resolveWithdrawal,
} from "@/lib/admin.functions";
import {
  cmsItems,
  cmsSaveItem,
  cmsToggleItem,
  cmsCases,
  cmsSaveCase,
  cmsCasePool,
  cmsSetPoolItem,
  cmsRemovePoolItem,
  cmsRoles,
  cmsSetRole,
  cmsSanction,
  cmsHistory,
  cmsGetSettings,
  cmsSaveSettings,
  DEFAULT_SETTINGS,
  type SiteSettings,
} from "@/lib/cms.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Staff panel — CaseForge" },
      {
        name: "description",
        content: "Internal CaseForge staff tools for skins, cases, players and settings.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Staff panel — CaseForge" },
      { property: "og:description", content: "Internal CaseForge staff tools." },
    ],
  }),
  component: AdminPage,
});

type UserRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  balance: number;
  level: number;
  is_banned: boolean;
  is_muted: boolean;
};

type ItemRow = {
  id: string;
  name: string;
  image_url: string | null;
  rarity: string;
  weapon: string | null;
  base_price: number;
  price_override: number | null;
  is_active: boolean;
};

type CaseRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  price: number;
  tag: string | null;
  image_url: string | null;
  is_active: boolean;
};

type PoolRow = {
  id: string;
  weight: number;
  chance: number;
  item: { id: string; name: string; image_url: string | null; rarity: string } | null;
};

type Tab =
  "overview" | "skins" | "cases" | "players" | "history" | "chat" | "withdrawals" | "settings";

const input =
  "w-full rounded-md border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary";
const ghost = "rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-surface";
const primaryBtn =
  "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

function AdminPage() {
  const t = useT();
  const { signedIn, isAdmin, localMode, ready: authReady, session } = useMe();
  const [tab, setTab] = useState<Tab>("overview");

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => withFreshSession(t("auth.sessionExpired"), () => amIStaff()),
    enabled: authReady && Boolean(session) && !localMode,
    retry: false,
  });
  const isStaff = isAdmin || Boolean(staffQuery.data?.staff);
  const live = authReady && Boolean(session) && isStaff && !localMode;

  if (!signedIn || !session || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">{t("admin.deniedTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.deniedLead")}</p>
      </main>
    );
  }

  const tabs: { id: Tab; title: string }[] = [
    { id: "overview", title: t("admin.tab.overview") },
    { id: "skins", title: t("admin.tab.skins") },
    { id: "cases", title: t("admin.tab.cases") },
    { id: "players", title: t("admin.tab.players") },
    { id: "history", title: t("admin.tab.history") },
    { id: "chat", title: t("admin.tab.chat") },
    { id: "withdrawals", title: t("admin.tab.withdrawals") },
    { id: "settings", title: t("admin.tab.settings") },
  ];

  return (
    <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("admin.title")}</h1>

      <nav className="panel flex flex-wrap gap-1 p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-md px-3 py-2 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${
              tab === x.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface hover:text-foreground"
            }`}
          >
            {x.title}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview live={live} />}
      {tab === "skins" && <SkinsEditor live={live} />}
      {tab === "cases" && <CasesEditor live={live} />}
      {tab === "players" && <PlayersEditor live={live} isAdmin={isAdmin} localMode={localMode} />}
      {tab === "history" && <HistoryPanel live={live} />}
      {tab === "chat" && <ChatPanel live={live} localMode={localMode} />}
      {tab === "withdrawals" && <WithdrawalsPanel live={live} />}
      {tab === "settings" && <SettingsPanel live={live} />}
    </main>
  );
}

/* ------------------------------- overview -------------------------------- */

function Overview({ live }: { live: boolean }) {
  const t = useT();
  const play = usePlay();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminStats(),
    enabled: live,
    retry: false,
  });
  const s = stats.data;
  const cards = [
    { label: t("admin.stat.players"), value: s?.users ?? 1 },
    { label: t("admin.stat.openings"), value: s?.openings ?? play.opened },
    { label: t("admin.stat.battles"), value: s?.battles ?? 0 },
    {
      label: t("admin.stat.messages"),
      value: s?.messages ?? play.chat.filter((m) => !m.is_deleted).length,
    },
    { label: t("admin.stat.items"), value: s?.items ?? play.inventory.length },
    {
      label: t("admin.stat.balances"),
      value: <Price value={Number(s?.totalBalance ?? 0)} />,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="panel p-4">
          <p className={label}>{card.label}</p>
          <p className="font-display text-lg font-bold text-primary">{card.value}</p>
        </div>
      ))}
    </section>
  );
}

/* --------------------------------- skins --------------------------------- */


function SkinsEditor({ live }: { live: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const items = useQuery({
    queryKey: ["cms-items", search],
    queryFn: () =>
      withFreshSession(
        t("auth.sessionExpired"),
        () => cmsItems({ data: { search } }) as Promise<ItemRow[]>,
      ),
    enabled: live,
    // The Supabase client may still be restoring the session on first mount,
    // so give an auth failure one silent retry before surfacing an error.
    retry: (count, e: Error) =>
      count < 2 && /session|unauthor|401/i.test(e?.message ?? ""),
    retryDelay: 400,
    staleTime: 5_000,
  });

  const sync = useMutation({
    mutationFn: () => withFreshSession(t("auth.sessionExpired"), () => marketSync()),
    onSuccess: (res: { synced: number }) => {
      if (!res?.synced) toast.warning(t("admin.skin.syncEmpty"));
      else toast.success(`${t("admin.skin.synced")} ${res.synced}`);
      qc.invalidateQueries({ queryKey: ["cms-items"] });
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      if (msg.includes("MARKET_TIMEOUT")) toast.error(t("admin.skin.syncTimeout"));
      else if (!(e instanceof SessionExpiredError)) toast.error(msg || t("admin.skin.syncError"));
    },
  });

  const saveOverride = useMutation({
    mutationFn: (v: { row: ItemRow; override: number | null }) =>
      withFreshSession(t("auth.sessionExpired"), () => cmsSaveItem({
        data: {
          id: v.row.id,
          name: v.row.name,
          rarity: v.row.rarity,
          weapon: v.row.weapon,
          image_url: v.row.image_url,
          base_price: Number(v.row.base_price) || 0,
          price_override: v.override,
          is_active: v.row.is_active,
        },
      })),
    onSuccess: () => {
      toast.success(t("admin.skin.overrideSaved"));
      qc.invalidateQueries({ queryKey: ["cms-items"] });
    },
    onError: (e: Error) => toast.error(e.message || t("admin.saveError")),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      withFreshSession(t("auth.sessionExpired"), () => cmsToggleItem({ data: v })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms-items"] }),
    onError: (e: Error) => toast.error(e.message || t("admin.saveError")),
  });

  const rows = items.data ?? [];

  return (
    <section className="panel space-y-4 p-5">
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <h2 className="font-display font-semibold">{t("admin.skin.syncTitle")}</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("admin.skin.syncHint")}</p>
        <button className={primaryBtn + " mt-3 inline-flex items-center gap-2"} disabled={sync.isPending} onClick={() => sync.mutate()}>
          {sync.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {sync.isPending ? t("admin.skin.syncing") : t("admin.skin.sync")}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-semibold">{t("admin.tab.skins")}</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.search")}
          className="rounded-md border bg-background/60 px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">{t("admin.skin.name")}</th>
              <th>{t("admin.skin.rarity")}</th>
              <th>{t("admin.skin.price")}</th>
              <th>{t("admin.skin.override")}</th>
              <th>{t("admin.skin.active")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <SkinLine
                key={it.id}
                row={it}
                pending={saveOverride.isPending}
                onSave={(override) => saveOverride.mutate({ row: it, override })}
                onToggle={() => toggle.mutate({ id: it.id, active: !it.is_active })}
              />
            ))}
            {items.isPending && (
              <tr aria-label={t("admin.loading")}>
                <td colSpan={6} className="space-y-2 py-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-4/5" />
                </td>
              </tr>
            )}
            {!items.isPending && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-xs text-muted-foreground">
                  {items.isError
                    ? t("admin.empty")
                    : search.trim()
                        ? t("admin.empty")
                        : t("admin.skin.dbEmpty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SkinLine({
  row,
  pending,
  onSave,
  onToggle,
}: {
  row: ItemRow;
  pending: boolean;
  onSave: (override: number | null) => void;
  onToggle: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(row.price_override === null ? "" : String(row.price_override));
  useEffect(
    () => setValue(row.price_override === null ? "" : String(row.price_override)),
    [row.price_override],
  );

  return (
    <tr className="border-t">
      <td className="py-2">
        <div className="flex items-center gap-2">
          {row.image_url && <img src={row.image_url} alt="" className="size-7 object-contain" />}
          <span className="truncate">{row.name}</span>
        </div>
      </td>
      <td className="text-xs text-muted-foreground">{row.rarity}</td>
      <td className="text-primary">
        <Price value={Number(row.base_price)} />
      </td>
      <td>
        <div className="flex items-center gap-1 py-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder="—"
            className="w-24 rounded-md border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            className={ghost}
            disabled={pending}
            onClick={() => onSave(value.trim() === "" ? null : Number(value) || 0)}
          >
            {t("admin.skin.overrideSave")}
          </button>
        </div>
      </td>
      <td className="text-xs text-muted-foreground">{row.is_active ? t("admin.skin.active") : "—"}</td>
      <td className="py-2 text-right">
        <button className={ghost} onClick={onToggle}>
          {row.is_active ? "Off" : "On"}
        </button>
      </td>
    </tr>
  );
}


function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/* --------------------------------- cases --------------------------------- */

const emptyCase = {
  name: "",
  category: "",
  tag: "",
  image_url: "",
  price: 0,
  is_active: true,
};

/** Drag & drop (or pick) a PNG cover — stored in the private covers bucket. */
function CoverPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const preview = useCoverUrl(value);

  const handle = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error(t("admin.case.badFile"));
      return;
    }
    setBusy(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of buffer) binary += String.fromCharCode(byte);
      const res = await uploadCaseCover({
        data: {
          fileName: file.name,
          contentType: file.type,
          dataBase64: btoa(binary),
        },
      });
      onChange(res.value);
      toast.success(t("admin.case.uploaded"));
    } catch (e) {
      toast.error((e as Error).message || t("admin.case.uploadError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-5 text-center text-xs transition-colors ${
          over ? "border-primary bg-primary/10" : "hover:bg-surface"
        }`}
      >
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide">
          {busy ? t("admin.case.uploading") : t("admin.case.upload")}
        </span>
        <span className="text-[11px] text-muted-foreground">{t("admin.case.uploadHint")}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={busy}
          onChange={(e) => void handle(e.target.files?.[0])}
        />
      </label>

      {preview && (
        <div className="flex items-center gap-3 rounded-md border bg-background/50 p-2">
          <img src={preview} alt="" className="size-16 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <p className={label}>{t("admin.case.preview")}</p>
            <button className={ghost + " mt-1"} onClick={() => onChange("")}>
              {t("admin.case.removeCover")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function CasesEditor({ live }: { live: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<(typeof emptyCase & { id?: string }) | null>(null);
  const [poolSearch, setPoolSearch] = useState("");

  const cases = useQuery({
    queryKey: ["cms-cases"],
    queryFn: () => cmsCases() as Promise<CaseRow[]>,
    enabled: live,
    retry: false,
  });
  const pool = useQuery({
    queryKey: ["cms-pool", selected],
    queryFn: () => cmsCasePool({ data: { caseId: selected! } }) as unknown as Promise<PoolRow[]>,
    enabled: live && Boolean(selected),
    retry: false,
  });
  const searchItems = useQuery({
    queryKey: ["cms-items", poolSearch],
    queryFn: () => cmsItems({ data: { search: poolSearch } }) as Promise<ItemRow[]>,
    enabled: live && poolSearch.trim().length > 1,
    retry: false,
  });

  const saveCase = useMutation({
    mutationFn: (d: typeof emptyCase & { id?: string }) =>
      cmsSaveCase({
        data: {
          ...(d.id ? { id: d.id } : {}),
          name: d.name.trim(),
          category: d.category.trim() || null,
          tag: d.tag.trim() || null,
          image_url: d.image_url.trim() || null,
          price: Number(d.price) || 0,
          is_active: d.is_active,
        },
      }),
    onSuccess: () => {
      toast.success(t("admin.case.saved"));
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["cms-cases"] });
    },
    onError: (e: Error) => toast.error(e.message || t("admin.saveError")),
  });

  const setWeight = useMutation({
    mutationFn: (v: { itemId: string; weight: number }) =>
      cmsSetPoolItem({ data: { caseId: selected!, itemId: v.itemId, weight: v.weight } }),
    onSuccess: () => {
      toast.success(t("admin.saved"));
      qc.invalidateQueries({ queryKey: ["cms-pool"] });
    },
    onError: (e: Error) => toast.error(e.message || t("admin.saveError")),
  });

  const removeRow = useMutation({
    mutationFn: (id: string) => cmsRemovePoolItem({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms-pool"] }),
    onError: () => toast.error(t("admin.saveError")),
  });

  const rows = cases.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <section className="panel space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold">{t("admin.tab.cases")}</h2>
          <button className={primaryBtn} onClick={() => setDraft({ ...emptyCase })}>
            {t("admin.new")}
          </button>
        </div>
        <div className="space-y-1">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                selected === c.id ? "border-primary/60 bg-primary/10" : "hover:bg-surface"
              }`}
            >
              <CaseCover value={c.image_url} className="size-8 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-xs text-primary">
                <Price value={Number(c.price)} />
              </span>
              <span
                className={ghost}
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft({
                    id: c.id,
                    name: c.name,
                    category: c.category ?? "",
                    tag: c.tag ?? "",
                    image_url: c.image_url ?? "",
                    price: Number(c.price),
                    is_active: c.is_active,
                  });
                }}
              >
                ✎
              </span>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {cases.isLoading ? t("admin.loading") : t("admin.empty")}
            </p>
          )}
        </div>

        {draft && (
          <div className="rounded-lg border bg-background/50 p-4">
            <h3 className="font-display text-sm font-bold">
              {draft.id ? t("admin.case.editTitle") : t("admin.case.newTitle")}
            </h3>
            <div className="mt-3 grid gap-3">
              <Field title={t("admin.case.name")}>
                <input
                  className={input}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field title={t("admin.case.category")}>
                <input
                  className={input}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
              <Field title={t("admin.case.tag")}>
                <input
                  className={input}
                  value={draft.tag}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                />
              </Field>
              <Field title={t("admin.case.cover")}>
                <CoverPicker
                  value={draft.image_url}
                  onChange={(v) => setDraft({ ...draft, image_url: v })}
                />
              </Field>
              <Field title={t("admin.case.price")}>
                <div className="flex items-center gap-2">
                  <input
                    className={input}
                    inputMode="decimal"
                    value={String(draft.price)}
                    onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                  />
                  {draft.id && draft.id === selected && (pool.data ?? []).length > 0 && (
                    <button
                      className={ghost + " shrink-0"}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          price: computeCasePrice(
                            (pool.data ?? []) as unknown as {
                              weight: number;
                              item: { base_price?: number; price_override?: number | null } | null;
                            }[],
                          ),
                        })
                      }
                    >
                      ⟳
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("admin.case.autoPrice")}
                </p>
              </Field>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
                {t("admin.case.active")}
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className={primaryBtn}
                disabled={!draft.name.trim() || saveCase.isPending}
                onClick={() => saveCase.mutate(draft)}
              >
                {t("admin.save")}
              </button>
              <button className={ghost} onClick={() => setDraft(null)}>
                {t("admin.cancel")}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="font-display font-semibold">{t("admin.case.pool")}</h2>
        {!selected ? (
          <p className="text-xs text-muted-foreground">{t("admin.case.pickCase")}</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">{t("admin.case.hiddenHint")}</p>
            {(() => {
              const rows = pool.data ?? [];
              const total = rows.reduce((s2, r) => s2 + Number(r.chance ?? 0), 0) * 100;
              const ok = Math.abs(total - 100) < 0.05;
              return (
                <div>
                  <p
                    className={`font-display text-xs font-bold ${ok ? "text-primary" : "text-destructive"}`}
                  >
                    {t("admin.case.totalChance")} {total.toFixed(2)}% {ok ? "✓" : "✕"}
                  </p>
                  {!ok && rows.length > 0 && (
                    <p className="text-[11px] text-destructive">
                      {t("admin.case.totalChanceError")}
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="space-y-1">
              {(pool.data ?? []).map((row) => (
                <PoolLine
                  key={row.id}
                  row={row}
                  othersWeight={(pool.data ?? [])
                    .filter((r) => r.id !== row.id)
                    .reduce((s2, r) => s2 + Number(r.weight ?? 0), 0)}
                  onSave={(weight) => row.item && setWeight.mutate({ itemId: row.item.id, weight })}
                  onRemove={() => removeRow.mutate(row.id)}
                />
              ))}
              {(pool.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">{t("admin.case.poolEmpty")}</p>
              )}
            </div>

            <div className="rounded-lg border bg-background/50 p-4">
              <h3 className="font-display text-sm font-bold">{t("admin.case.addSkin")}</h3>
              <input
                className={input + " mt-2"}
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                placeholder={t("admin.search")}
              />
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {(searchItems.data ?? []).map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    <button
                      className={ghost}
                      onClick={() => setWeight.mutate({ itemId: it.id, weight: 100 })}
                    >
                      {t("admin.case.addSkin")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PoolLine({
  row,
  othersWeight,
  onSave,
  onRemove,
}: {
  row: PoolRow;
  othersWeight: number;
  onSave: (weight: number) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [percent, setPercent] = useState((Number(row.chance ?? 0) * 100).toFixed(2));
  useEffect(() => setPercent((Number(row.chance ?? 0) * 100).toFixed(2)), [row.chance]);

  /** Turn a wanted drop chance into the weight that produces it. */
  const save = () => {
    const p = Math.min(99.9, Math.max(0.01, Number(percent) || 0)) / 100;
    const weight = othersWeight > 0 ? (p * othersWeight) / (1 - p) : 100;
    onSave(Math.max(1, Math.round(weight)));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2 text-sm last:border-0">
      {row.item?.image_url && (
        <img src={row.item.image_url} alt="" className="size-7 object-contain" />
      )}
      <span className="min-w-0 flex-1 truncate">{row.item?.name}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("admin.case.chance")}
      </span>
      <input
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        inputMode="decimal"
        className="w-20 rounded-md border bg-background/60 px-2 py-1 text-right text-xs outline-none focus:border-primary"
        placeholder="%"
      />
      <span className="text-xs text-muted-foreground">%</span>
      <span className="w-16 text-right text-[10px] text-muted-foreground">
        {t("admin.case.weight")} {row.weight}
      </span>
      <button className={ghost} onClick={save}>
        {t("admin.save")}
      </button>
      <button className={ghost} onClick={onRemove}>
        {t("admin.case.remove")}
      </button>
    </div>
  );
}

/* -------------------------------- players -------------------------------- */

function PlayersEditor({
  live,
  isAdmin,
  localMode,
}: {
  live: boolean;
  isAdmin: boolean;
  localMode: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const play = usePlay();
  const { data: me } = useMe();
  const overrides = useBalanceOverrides();
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [sanction, setSanction] = useState<{
    userId: string;
    username: string;
    kind: "mute" | "ban";
    active: boolean;
  } | null>(null);

  const users = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => adminListUsers({ data: { search } }),
    enabled: live,
    retry: false,
  });
  const roles = useQuery({
    queryKey: ["cms-roles"],
    queryFn: () => cmsRoles() as Promise<{ user_id: string; role: string }[]>,
    enabled: live,
    retry: false,
  });

  const adjust = useMutation({
    mutationFn: (vars: { userId: string; amount: number }) => adminAdjustBalance({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const setRole = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "moderator" | "user" }) =>
      cmsSetRole({ data: vars }),
    onSuccess: () => {
      toast.success(t("admin.player.roleUpdated"));
      qc.invalidateQueries({ queryKey: ["cms-roles"] });
    },
    onError: (e: Error) => toast.error(e.message || t("admin.player.roleError")),
  });

  const flags = useMutation({
    mutationFn: async (vars: {
      userId: string;
      kind: "mute" | "ban";
      active: boolean;
      reason?: string;
      minutes?: number;
    }) => {
      setLocalFlags(vars.userId, {
        ...(vars.kind === "ban" ? { is_banned: vars.active } : { is_muted: vars.active }),
      });
      if (localMode) return { ok: true };
      await adminSetFlags({
        data: {
          userId: vars.userId,
          ...(vars.kind === "ban" ? { banned: vars.active } : { muted: vars.active }),
        },
      }).catch(() => undefined);
      return cmsSanction({ data: vars });
    },
    onSuccess: () => {
      toast.success(t("admin.sanction.applied"));
      setSanction(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message || t("admin.sanction.error")),
  });

  const saveBalance = (user: { id: string; balance: number }, raw: string) => {
    const next = Number(String(raw).replace(/\s+/g, "").replace(",", "."));
    if (!Number.isFinite(next) || next < 0) {
      toast.error(t("admin.player.badAmount"));
      return;
    }
    const current = overrides[user.id] ?? user.balance;
    setBalanceOverride(user.id, next);
    qc.invalidateQueries({ queryKey: ["me"] });
    toast.success(`${t("admin.player.balanceUpdated")} ${money(next)}`);
    const delta = Math.round((next - current) * 100) / 100;
    if (delta !== 0 && !localMode) {
      adjust.mutate({ userId: user.id, amount: delta }, { onError: () => {} });
    }
  };

  const serverRows = (Array.isArray(users.data) ? users.data : []) as UserRow[];
  const localRow: UserRow | null = me?.profile
    ? {
        id: String(me.profile.id),
        username: me.profile.username ?? "Player",
        avatar_url: me.profile.avatar_url ?? null,
        balance: Number(me.profile.balance ?? 0),
        level: 1,
        is_banned: false,
        is_muted: false,
      }
    : null;
  const merged = (
    localRow && !serverRows.some((r) => r.id === localRow.id)
      ? [localRow, ...serverRows]
      : serverRows
  ).map((r) => ({ ...r, ...readFlags(play, r.id) }));
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? merged.filter(
        (r) => r.username.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle),
      )
    : merged;
  const roleOf = (id: string) => (roles.data ?? []).find((r) => r.user_id === id)?.role ?? "user";

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-semibold">{t("admin.tab.players")}</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.searchPlayers")}
          className="rounded-md border bg-background/60 px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">{t("admin.player.player")}</th>
              <th>{t("admin.player.balance")}</th>
              <th>{t("admin.player.status")}</th>
              <th>{t("admin.player.role")}</th>
              <th className="text-right">{t("admin.player.setBalance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const current = overrides[u.id] ?? u.balance;
              const draft = amounts[u.id] ?? String(current);
              const setDraft = (v: number | string) =>
                setAmounts((p) => ({ ...p, [u.id]: typeof v === "number" ? String(v) : v }));
              return (
                <tr key={u.id} className="border-t align-middle">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="size-7 rounded border object-cover"
                        />
                      ) : (
                        <span className="grid size-7 place-items-center rounded border bg-surface text-[10px]">
                          {u.username.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate">{u.username}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-semibold text-primary">
                    <Price value={current} />
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {u.is_banned
                      ? t("admin.player.banned")
                      : u.is_muted
                        ? t("admin.player.muted")
                        : t("admin.player.activeStatus")}
                  </td>
                  <td>
                    <select
                      value={roleOf(u.id)}
                      disabled={!isAdmin || localMode}
                      onChange={(e) =>
                        setRole.mutate({
                          userId: u.id,
                          role: e.target.value as "admin" | "moderator" | "user",
                        })
                      }
                      className="rounded-md border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="moderator">Mod</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1 py-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        inputMode="decimal"
                        placeholder={t("admin.player.giveBalance")}
                        className="w-28 rounded-md border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary"
                      />
                      <button
                        className={ghost}
                        onClick={() => setDraft((Number(draft) || 0) + 1000)}
                      >
                        +1 000
                      </button>
                      <button
                        className={ghost}
                        onClick={() => setDraft((Number(draft) || 0) + 10000)}
                      >
                        +10 000
                      </button>
                      <button className={ghost} onClick={() => setDraft(0)}>
                        0
                      </button>
                      <button
                        onClick={() => saveBalance(u, draft)}
                        className="rounded-md border border-primary/60 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                      >
                        {t("admin.player.setBalance")}
                      </button>
                      <button
                        className={ghost}
                        onClick={() =>
                          setSanction({
                            userId: u.id,
                            username: u.username,
                            kind: "mute",
                            active: !u.is_muted,
                          })
                        }
                      >
                        {u.is_muted ? t("admin.player.unmute") : t("admin.player.mute")}
                      </button>
                      <button
                        className={ghost}
                        onClick={() =>
                          setSanction({
                            userId: u.id,
                            username: u.username,
                            kind: "ban",
                            active: !u.is_banned,
                          })
                        }
                      >
                        {u.is_banned ? t("admin.player.unban") : t("admin.player.ban")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-xs text-muted-foreground">
                  {users.isLoading ? t("admin.loading") : t("admin.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sanction && (
        <SanctionDialog
          data={sanction}
          pending={flags.isPending}
          onClose={() => setSanction(null)}
          onApply={(reason, minutes) =>
            flags.mutate({
              userId: sanction.userId,
              kind: sanction.kind,
              active: sanction.active,
              ...(reason ? { reason } : {}),
              ...(minutes ? { minutes } : {}),
            })
          }
        />
      )}
    </section>
  );
}

function SanctionDialog({
  data,
  pending,
  onClose,
  onApply,
}: {
  data: { username: string; kind: "mute" | "ban"; active: boolean };
  pending: boolean;
  onClose: () => void;
  onApply: (reason: string, minutes: number) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="panel w-full max-w-md space-y-3 p-6">
        <h3 className="font-display text-lg font-bold">{t("admin.sanction.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {data.username} ·{" "}
          {data.kind === "ban"
            ? data.active
              ? t("admin.player.ban")
              : t("admin.player.unban")
            : data.active
              ? t("admin.player.mute")
              : t("admin.player.unmute")}
        </p>
        {data.active && (
          <>
            <Field title={t("admin.sanction.reason")}>
              <input
                className={input}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field title={t("admin.sanction.minutes")}>
              <input
                className={input}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder={t("admin.sanction.forever")}
              />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className={ghost} onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button
            className={primaryBtn}
            disabled={pending}
            onClick={() => onApply(reason.trim(), Number(minutes) || 0)}
          >
            {t("admin.sanction.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- history -------------------------------- */

function HistoryPanel({ live }: { live: boolean }) {
  const t = useT();
  const [kind, setKind] = useState<"cases" | "upgrades" | "contracts">("cases");
  const rows = useQuery({
    queryKey: ["cms-history", kind],
    queryFn: () => cmsHistory({ data: { kind } }) as Promise<Record<string, unknown>[]>,
    enabled: live,
    retry: false,
  });

  const subTabs: { id: typeof kind; title: string }[] = [
    { id: "cases", title: t("admin.history.cases") },
    { id: "upgrades", title: t("admin.history.upgrades") },
    { id: "contracts", title: t("admin.history.contracts") },
  ];

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap gap-1">
        {subTabs.map((s) => (
          <button
            key={s.id}
            onClick={() => setKind(s.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              kind === s.id
                ? "bg-primary text-primary-foreground"
                : "border text-muted-foreground hover:bg-surface"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">{t("admin.history.when")}</th>
              <th>{t("admin.history.player")}</th>
              <th>{t("admin.history.item")}</th>
              <th>{kind === "upgrades" ? t("admin.history.stake") : t("admin.history.value")}</th>
              <th>{kind === "cases" ? "" : t("admin.history.result")}</th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => {
              const profile = r["profile"] as { username?: string } | null;
              const item = (r["item"] ?? r["target"]) as { name?: string } | null;
              const stake = Number(r["stake"] ?? r["input_value"] ?? r["value"] ?? 0);
              const result =
                kind === "upgrades"
                  ? r["won"]
                    ? "+"
                    : "−"
                  : kind === "contracts"
                    ? Number(r["output_value"] ?? 0)
                    : "";
              return (
                <tr key={String(r["id"])} className="border-t">
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(String(r["created_at"])).toLocaleString()}
                  </td>
                  <td className="text-xs">{profile?.username ?? "—"}</td>
                  <td className="truncate">{item?.name ?? "—"}</td>
                  <td className="text-primary">
                    <Price value={stake} />
                  </td>
                  <td className="text-xs">
                    {typeof result === "number" ? <Price value={result} /> : result}
                  </td>
                </tr>
              );
            })}
            {(rows.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-xs text-muted-foreground">
                  {rows.isLoading ? t("admin.loading") : t("admin.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------------- chat --------------------------------- */

function ChatPanel({ live, localMode }: { live: boolean; localMode: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const play = usePlay();
  const [minutes, setMinutes] = useState(60);
  const chat = useQuery({
    queryKey: ["admin-chat"],
    queryFn: () => adminListChat(),
    enabled: live,
    retry: false,
    refetchInterval: live ? 15_000 : false,
  });

  // Live updates: any new or moderated message refreshes the list instantly.
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel("admin-chat-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-chat"] });
          qc.invalidateQueries({ queryKey: ["chat"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [live, qc]);

  const removeMessage = useMutation({
    mutationFn: async (id: string) => {
      deleteLocalMessage(id);
      if (!localMode) return adminDeleteChat({ data: { id } });
      return { ok: true };
    },
    onSuccess: () => {
      toast.success(t("admin.chat.removed"));
      qc.invalidateQueries({ queryKey: ["admin-chat"] });
      qc.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: () => toast.error(t("admin.saveError")),
  });

  const mute = useMutation({
    mutationFn: (v: { userId: string }) =>
      cmsSanction({ data: { userId: v.userId, kind: "mute", active: true, minutes } }),
    onSuccess: () => {
      toast.success(
        `${t("admin.chat.muted")} · ${
          minutes < 60
            ? `${minutes} ${t("admin.chat.minutes")}`
            : minutes < 24 * 60
              ? t(minutes === 60 ? "admin.chat.dur1h" : "admin.chat.dur24h")
              : t(minutes === 24 * 60 ? "admin.chat.dur24h" : "admin.chat.dur7d")
        }`,
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error(t("admin.saveError")),
  });

  const chatRows = (localMode ? play.chat : (chat.data ?? [])) as {
    id: string;
    user_id?: string | null;
    username: string;
    body: string;
    is_deleted: boolean;
  }[];

  return (
    <section className="panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display font-semibold">{t("admin.chat.title")}</h2>
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("admin.chat.muteFor")}
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-md border bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          >
            {(
              [
                [5, "admin.chat.dur5m"],
                [30, "admin.chat.dur30m"],
                [60, "admin.chat.dur1h"],
                [24 * 60, "admin.chat.dur24h"],
                [7 * 24 * 60, "admin.chat.dur7d"],
              ] as const
            ).map(([m, key]) => (
              <option key={m} value={m}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        {chatRows.map((m) => (
          <div key={m.id} className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
            <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
              {m.username}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${m.is_deleted ? "line-through opacity-50" : ""}`}
            >
              {m.body}
            </span>
            {m.user_id && !localMode && (
              <button
                className={ghost}
                disabled={mute.isPending}
                onClick={() => mute.mutate({ userId: String(m.user_id) })}
              >
                {t("admin.chat.mute")}
              </button>
            )}
            {!m.is_deleted && (
              <button className={ghost} onClick={() => removeMessage.mutate(m.id)}>
                {t("admin.chat.delete")}
              </button>
            )}
          </div>
        ))}
        {chatRows.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("admin.chat.empty")}</p>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- withdrawals -------------------------------- */

function WithdrawalsPanel({ live }: { live: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const withdrawals = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => adminWithdrawals(),
    enabled: live,
    retry: false,
  });

  const resolve = useMutation({
    mutationFn: (vars: { id: string; status: "sent" | "failed" | "cancelled" }) =>
      resolveWithdrawal({ data: vars }),
    onSuccess: () => {
      toast.success(t("admin.wd.updated"));
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: () => toast.error(t("admin.wd.error")),
  });

  return (
    <section className="panel space-y-3 p-5">
      <h2 className="font-display font-semibold">{t("admin.wd.title")}</h2>
      <div className="space-y-2">
        {(withdrawals.data ?? []).map((w) => {
          const item = w.item as unknown as { name: string } | null;
          const profile = w.profile as unknown as { username: string } | null;
          return (
            <div
              key={w.id}
              className="flex flex-wrap items-center gap-3 border-b py-2 text-sm last:border-0"
            >
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
                {profile?.username ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate">{item?.name ?? "—"}</span>
              <span className="font-display text-primary">
                <Price value={w.value} />
              </span>
              <a
                href={w.trade_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-secondary underline-offset-4 hover:underline"
              >
                {t("admin.wd.tradeLink")}
              </a>
              {w.status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    className={ghost}
                    onClick={() => resolve.mutate({ id: w.id, status: "sent" })}
                  >
                    {t("admin.wd.sent")}
                  </button>
                  <button
                    className={ghost}
                    onClick={() => resolve.mutate({ id: w.id, status: "failed" })}
                  >
                    {t("admin.wd.return")}
                  </button>
                </div>
              ) : (
                <span className="font-display text-xs uppercase text-muted-foreground">
                  {w.status}
                </span>
              )}
            </div>
          );
        })}
        {(withdrawals.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">{t("admin.wd.empty")}</p>
        )}
      </div>
    </section>
  );
}

/* -------------------------------- settings ------------------------------- */

function SettingsPanel({ live }: { live: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState<SiteSettings>(DEFAULT_SETTINGS);

  const settings = useQuery({
    queryKey: ["cms-settings"],
    queryFn: () => cmsGetSettings() as Promise<SiteSettings>,
    enabled: live,
    retry: false,
  });

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (d: SiteSettings) => cmsSaveSettings({ data: d }),
    onSuccess: () => toast.success(t("admin.settings.saved")),
    onError: (e: Error) => toast.error(e.message || t("admin.saveError")),
  });

  const toggles: { key: keyof SiteSettings; title: string }[] = [
    { key: "casesEnabled", title: t("admin.settings.cases") },
    { key: "upgradeEnabled", title: t("admin.settings.upgrade") },
    { key: "contractsEnabled", title: t("admin.settings.contracts") },
    { key: "battlesEnabled", title: t("admin.settings.battles") },
  ];

  return (
    <section className="panel space-y-4 p-5">
      <h2 className="font-display font-semibold">{t("admin.settings.title")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field title={t("admin.settings.rtp")}>
          <input
            className={input}
            inputMode="numeric"
            value={String(draft.rtp)}
            onChange={(e) => setDraft({ ...draft, rtp: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field title={t("admin.settings.upgradeHouse")}>
          <input
            className={input}
            inputMode="numeric"
            value={String(draft.upgradeHouse)}
            onChange={(e) => setDraft({ ...draft, upgradeHouse: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {toggles.map((x) => (
          <label
            key={String(x.key)}
            className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2 text-sm"
          >
            {x.title}
            <input
              type="checkbox"
              checked={Boolean(draft[x.key])}
              onChange={(e) => setDraft({ ...draft, [x.key]: e.target.checked })}
            />
          </label>
        ))}
      </div>

      <Field title={t("admin.settings.announcement")}>
        <textarea
          className={input + " min-h-20"}
          value={draft.announcement}
          maxLength={300}
          onChange={(e) => setDraft({ ...draft, announcement: e.target.value })}
        />
      </Field>

      <button className={primaryBtn} disabled={save.isPending} onClick={() => save.mutate(draft)}>
        {t("admin.save")}
      </button>
    </section>
  );
}
