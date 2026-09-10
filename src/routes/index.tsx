import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCases } from "@/lib/public.functions";
import { money, rarityColor } from "@/lib/rarity";
import { useT } from "@/lib/i18n";
import { Price } from "@/components/site/Coin";
import { CaseCover } from "@/components/site/CaseCover";
import { casePrice, type PoolRow } from "@/lib/pricing";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CaseForge — open CS2 cases, provably fair" },
      {
        name: "description",
        content:
          "Open CS2 cases with provably fair rolls, watch live drops from other players, and sell your skins back instantly.",
      },
      { property: "og:title", content: "CaseForge — open CS2 cases, provably fair" },
      {
        property: "og:description",
        content: "Provably fair CS2 case opening with live drops and instant sell-back.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => listCases(),
    staleTime: 60_000,
  });
  const cases = data ?? [];
  const categories = [...new Set(cases.map((c) => c.category))];

  const totalItems = cases.reduce((n, c) => n + ((c.case_items ?? []).length as number), 0);
  // Prices always follow the skins in the pool when the case has no fixed price.
  const priceOf = (c: (typeof cases)[number]) =>
    casePrice(c.price, (c.case_items ?? []) as unknown as PoolRow[]);
  const cheapest = cases.length ? Math.min(...cases.map(priceOf)) : 0;


  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:py-10">
      <section className="hero-aura relative overflow-hidden rounded-xl border p-6 sm:p-12">
        <div className="relative max-w-2xl">
          <p className="font-display text-[11px] uppercase tracking-[0.3em] text-secondary sm:text-xs">
            {t("home.kicker")}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] sm:text-6xl">
            {t("home.title1")} <span className="text-gradient-gold">{t("home.title2")}</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
            {t("home.lead")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#cases"
              className="glow-primary rounded-md bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground"
            >
              {t("home.browse")}
            </a>
            <Link
              to="/fair"
              className="rounded-md border px-6 py-3 font-display text-sm font-bold uppercase tracking-wide hover:bg-surface-2"
            >
              {t("home.how")}
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-2 text-xs sm:gap-3 sm:text-sm">
            <span className="stat-chip">
              <span className="font-display font-bold text-primary">{cases.length || "—"}</span>
              <span className="text-muted-foreground">{t("home.statCases")}</span>
            </span>
            <span className="stat-chip">
              <span className="font-display font-bold text-primary">{totalItems || "—"}</span>
              <span className="text-muted-foreground">{t("home.statSkins")}</span>
            </span>
            <span className="stat-chip">
              <span className="uppercase text-muted-foreground">{t("home.statFrom")}</span>
              <span className="font-display font-bold text-primary">
                {cheapest ? <Price value={cheapest} /> : "—"}
              </span>
            </span>
          </div>
        </div>
      </section>

      <div id="cases" className="mt-10 space-y-10 sm:mt-14 sm:space-y-14">
        {isLoading && <p className="text-sm text-muted-foreground">{t("home.loading")}</p>}
        {categories.map((cat) => (
          <section key={cat}>
            <div className="flex items-center gap-4">
              <h2 className="font-display text-lg font-bold tracking-tight sm:text-2xl">{cat}</h2>
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {cases.filter((c) => c.category === cat).length}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {cases
                .filter((c) => c.category === cat)
                .map((c) => {
                  const pool = (c.case_items ?? []) as unknown as {
                    item: {
                      id: string;
                      name: string;
                      image_url: string | null;
                      rarity: string;
                    } | null;
                  }[];
                  const best = pool[0]?.item ?? null;
                  const rarities = [
                    ...new Set(pool.map((p) => p.item?.rarity).filter(Boolean)),
                  ].slice(-5) as string[];
                  return (
                    <Link
                      key={c.id}
                      to="/case/$slug"
                      params={{ slug: c.slug }}
                      className="case-card group flex flex-col items-center overflow-hidden p-4 sm:p-5"
                    >
                      {c.tag && (
                        <span className="absolute left-3 top-3 rounded bg-secondary/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-secondary">
                          {c.tag}
                        </span>
                      )}
                      <div
                        className="flex h-24 items-center justify-center transition-transform duration-200 group-hover:scale-110 sm:h-28"
                        style={{
                          filter: `drop-shadow(0 10px 24px ${rarityColor(best?.rarity ?? "covert")}55)`,
                        }}
                      >
                        {c.image_url ? (
                          <CaseCover
                            value={c.image_url}
                            alt={c.name}
                            className="max-h-24 object-contain sm:max-h-28"
                          />
                        ) : best?.image_url ? (
                          <img
                            src={best.image_url}
                            alt=""
                            className="max-h-24 object-contain sm:max-h-28"
                          />
                        ) : (
                          <span
                            className="text-5xl"
                            style={{ color: rarityColor(best?.rarity ?? "covert") }}
                          >
                            ✦
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex gap-1">
                        {rarities.map((r) => (
                          <span
                            key={r}
                            className="h-1 w-4 rounded-full"
                            style={{ background: rarityColor(r) }}
                          />
                        ))}
                      </div>
                      <p className="mt-2 text-center text-xs font-semibold sm:text-sm">{c.name}</p>
                      <p className="mt-1 font-display text-lg font-bold text-primary sm:text-xl">
                        {<Price value={priceOf(c)} />}
                      </p>
                      <span className="mt-3 w-full rounded-md bg-surface-2 py-2 text-center font-display text-xs font-bold uppercase tracking-wide transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        {t("home.openCase")}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
