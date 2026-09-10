import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, History, RefreshCw } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { setClientSeed, rotateSeed, seedHistory } from "@/lib/game.functions";
import { rotateLocalSeed, setLocalClientSeed, usePlay } from "@/lib/local-play";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/fair")({
  head: () => ({
    meta: [
      { title: "Provably Fair — CaseForge" },
      {
        name: "description",
        content:
          "Manage your CaseForge seeds and verify any upgrade yourself: client seed, server seed, public hash and nonce.",
      },
      { property: "og:title", content: "Provably Fair — CaseForge" },
      {
        property: "og:description",
        content:
          "Manage your seeds and verify any CaseForge upgrade with the server seed, client seed and nonce.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FairPage,
});

const tabBase =
  "flex-1 rounded-md px-4 py-2 font-display text-[13px] font-bold uppercase tracking-wide transition-colors";

function FairPage() {
  const t = useT();
  const [tab, setTab] = useState<"seeds" | "check">("seeds");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("fair.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("fair.lead")}</p>

      <div className="panel mt-6 flex gap-1 p-1">
        <button
          className={
            tab === "seeds"
              ? `${tabBase} bg-primary text-primary-foreground`
              : `${tabBase} text-muted-foreground hover:text-foreground`
          }
          onClick={() => setTab("seeds")}
        >
          {t("fair.tabSeeds")}
        </button>
        <button
          className={
            tab === "check"
              ? `${tabBase} bg-primary text-primary-foreground`
              : `${tabBase} text-muted-foreground hover:text-foreground`
          }
          onClick={() => setTab("check")}
        >
          {t("fair.tabCheck")}
        </button>
      </div>

      {tab === "seeds" ? <SeedSettings /> : <CheckUpgrade />}
    </main>
  );
}

const inputClass =
  "w-full rounded-md border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary";
const rowClass = "flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-0";
const labelClass = "w-40 shrink-0 text-xs uppercase tracking-wide text-muted-foreground";
const valueClass = "min-w-[200px] flex-1 break-all font-mono text-xs";
const ghostBtn =
  "rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-surface disabled:opacity-50";

/** Local fallback used when the server seed service can't be reached. */
function localDemoSeed() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function SeedSettings() {
  const t = useT();
  const { data, signedIn, localMode } = useMe();
  const play = usePlay();
  const qc = useQueryClient();
  const seed = localMode ? play.seed : data?.seed;

  const [showChange, setShowChange] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [client, setClient] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isDemoSeed, setIsDemoSeed] = useState(false);

  const history = useQuery({
    queryKey: ["seed-history"],
    queryFn: () => seedHistory(),
    enabled: signedIn && !localMode && showHistory,
  });

  const saveSeed = useMutation({
    mutationFn: async () => {
      if (localMode) {
        setLocalClientSeed(client.trim());
        return { ok: true };
      }
      return setClientSeed({ data: { clientSeed: client.trim() } });
    },
    onSuccess: () => {
      toast.success(t("fair.seedSaved"));
      setShowChange(false);
      setClient("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => toast.error(t("fair.seedError")),
  });

  const rotate = useMutation({
    mutationFn: async (): Promise<{ seed: string; demo: boolean }> => {
      if (!localMode) {
        try {
          const res = await rotateSeed();
          const serverSeed = res?.revealed?.serverSeed;
          if (serverSeed) return { seed: serverSeed, demo: false };
        } catch (err) {
          console.error("reveal server seed failed", err);
        }
      }
      // Local play: retire the current seed and start a fresh one right here.
      return { seed: rotateLocalSeed().revealed || localDemoSeed(), demo: false };
    },
    onSuccess: ({ seed, demo }) => {
      setRevealed(seed);
      setIsDemoSeed(demo);
      toast.success(t("fair.revealed"));
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["seed-history"] });
    },
  });

  if (!signedIn) {
    return <div className="panel mt-6 p-6 text-sm text-muted-foreground">{t("fair.signIn")}</div>;
  }

  return (
    <section className="panel mt-6 p-6">
      <h2 className="font-display text-base font-semibold">{t("fair.current")}</h2>

      <div className="mt-3">
        <div className={rowClass}>
          <span className={labelClass}>{t("fair.clientSeed")}</span>
          <span className={valueClass}>{seed?.client_seed ?? "—"}</span>
          <button className={ghostBtn} onClick={() => setShowChange((v) => !v)}>
            {t("fair.change")}
          </button>
          <button className={ghostBtn} onClick={() => setShowHistory((v) => !v)}>
            <span className="inline-flex items-center gap-1">
              <History className="size-3.5" /> {t("fair.history")}
            </span>
          </button>
        </div>

        {showChange && (
          <div className="flex flex-wrap gap-2 py-3">
            <input
              className={inputClass + " flex-1 min-w-[220px]"}
              placeholder={t("fair.newSeedPh")}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={64}
            />
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              onClick={() => saveSeed.mutate()}
              disabled={saveSeed.isPending || !client.trim()}
            >
              {t("fair.save")}
            </button>
          </div>
        )}

        {showHistory && (
          <div className="space-y-2 py-3">
            {(history.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">{t("fair.noSeeds")}</p>
            )}
            {(history.data ?? []).map((s) => (
              <div key={s.id} className="rounded-md border bg-background/60 p-3 text-xs">
                <p className="font-mono break-all">client: {s.client_seed}</p>
                <p className="font-mono break-all text-muted-foreground">
                  server: {s.server_seed ?? "hidden (active seed)"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("fair.rolls")}: {String(s.nonce)} · {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className={rowClass}>
          <span className={labelClass}>{t("fair.serverSeed")}</span>
          <span className={valueClass}>{revealed ?? t("fair.serverHidden")}</span>
          {revealed && isDemoSeed && (
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {t("fair.demo")}
            </span>
          )}
        </div>
        <div className={rowClass}>
          <span className={labelClass}>{t("fair.salt")}</span>
          <span className={valueClass}>{t("fair.saltHidden")}</span>
        </div>
        <div className={rowClass}>
          <span className={labelClass}>{t("fair.publicHash")}</span>
          <span className={valueClass}>{seed?.server_seed_hash ?? "—"}</span>
        </div>
        <div className={rowClass}>
          <span className={labelClass}>{t("fair.nonce")}</span>
          <span className={valueClass}>{String(seed?.nonce ?? 0)}</span>
        </div>
      </div>

      <button
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        onClick={() => rotate.mutate()}
        disabled={rotate.isPending}
      >
        {rotate.isPending ? (
          <RefreshCw className="size-4 animate-spin" />
        ) : (
          <Eye className="size-4" />
        )}
        {t("fair.reveal")}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">{t("fair.revealHint")}</p>
    </section>
  );
}

async function computeRoll(serverSeed: string, clientSeed: string, nonce: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}:0`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hex, roll: parseInt(hex.slice(0, 13), 16) / 16 ** 13 };
}

function CheckUpgrade() {
  const t = useT();
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState("1");
  const [chance, setChance] = useState("50");
  const [out, setOut] = useState<{ roll: number; hex: string; won: boolean } | null>(null);

  async function check() {
    try {
      const { hex, roll } = await computeRoll(serverSeed.trim(), clientSeed.trim(), Number(nonce));
      setOut({ hex, roll, won: roll * 100 < Number(chance) });
    } catch {
      toast.error(t("fair.checkError"));
    }
  }

  return (
    <section className="panel mt-6 space-y-3 p-6">
      <h2 className="font-display text-base font-semibold">{t("fair.checkTitle")}</h2>
      <p className="text-xs text-muted-foreground">{t("fair.checkLead")}</p>
      <input
        className={inputClass}
        placeholder={t("fair.phServer")}
        value={serverSeed}
        onChange={(e) => setServerSeed(e.target.value)}
      />
      <input
        className={inputClass}
        placeholder={t("fair.phClient")}
        value={clientSeed}
        onChange={(e) => setClientSeed(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <input
          className={inputClass + " flex-1 min-w-[120px]"}
          placeholder={t("fair.phNonce")}
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
        />
        <input
          className={inputClass + " flex-1 min-w-[120px]"}
          placeholder={t("fair.phChance")}
          value={chance}
          onChange={(e) => setChance(e.target.value)}
        />
      </div>
      <button
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        onClick={() => void check()}
        disabled={!serverSeed.trim() || !clientSeed.trim()}
      >
        {t("fair.verify")}
      </button>

      {out && (
        <div className="rounded-md border bg-background/60 p-4 text-xs">
          <p className="break-all font-mono">hash: {out.hex}</p>
          <p className="mt-1 font-mono">roll: {(out.roll * 100).toFixed(4)}%</p>
          <p
            className={`mt-2 font-display font-bold ${out.won ? "text-success" : "text-destructive"}`}
          >
            {out.won ? t("fair.win") : t("fair.loss")}
          </p>
        </div>
      )}

      <pre className="overflow-x-auto rounded-md border bg-background/60 p-4 text-xs">
        {`hash = HMAC_SHA256(serverSeed, clientSeed + ":" + nonce + ":0")
roll = first 13 hex characters of hash / 16^13`}
      </pre>
    </section>
  );
}
