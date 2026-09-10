/**
 * Market sync: pulls the public CS2 skin catalogue (artwork + rarity) and the
 * current MarketCSGO prices, then refreshes the `items` table.
 *
 * Manual price overrides (`price_override`) and the admin's `is_active` flags
 * are never touched for skins that already exist.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loose } from "@/lib/supabase-loose";

const SKINS_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";

const MAX_ITEMS = 600;
const CATALOGUE_TIMEOUT_MS = 20_000;
const MARKET_TIMEOUT = "MARKET_TIMEOUT";

type ApiSkin = {
  name?: string;
  weapon?: { name?: string } | null;
  rarity?: { id?: string; name?: string } | null;
  image?: string;
};

const RARITY_MAP: Record<string, string> = {
  rarity_common_weapon: "consumer",
  rarity_uncommon_weapon: "industrial",
  rarity_rare_weapon: "milspec",
  rarity_mythical_weapon: "restricted",
  rarity_legendary_weapon: "classified",
  rarity_ancient_weapon: "covert",
  rarity_contraband_weapon: "contraband",
  rarity_ancient: "exotic",
};

const WEAR_ORDER = [
  "(Field-Tested)",
  "(Minimal Wear)",
  "(Factory New)",
  "(Well-Worn)",
  "(Battle-Scarred)",
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fetchCatalogue(): Promise<ApiSkin[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOGUE_TIMEOUT_MS);
  try {
    const res = await fetch(SKINS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error("Market catalogue is unavailable right now");
    return (await res.json()) as ApiSkin[];
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error(MARKET_TIMEOUT);
    }
    throw error instanceof Error ? error : new Error("Market catalogue is unavailable right now");
  } finally {
    clearTimeout(timer);
  }
}

export const marketSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdminClient } = await import("@/lib/supabase-admin.server");
    const db = loose(getAdminClient());

    const { requireStaffRoles } = await import("@/lib/staff-guard");
    await requireStaffRoles(db, context.userId);

    const { fetchMarketOffers, marketApiKey } = await import("@/lib/marketcsgo.server");

    const [catalogue, market] = await Promise.all([
      fetchCatalogue(),
      // Works with or without MARKET_CSGO_API_KEY: the public endpoints are the
      // fallback so the database still fills on a fresh deployment.
      fetchMarketOffers("USD").catch((error: unknown) => {
        if (error instanceof Error && error.message === MARKET_TIMEOUT) throw error;
        console.warn("[market] price feed unavailable", error);
        return { offers: [], source: "prices" as const, keyed: Boolean(marketApiKey()) };
      }),
    ]);

    // market_hash_name -> price, so exact wear variants can be preferred.
    const priceByName = new Map<string, number>();
    for (const offer of market.offers) {
      const current = priceByName.get(offer.marketHashName);
      if (current === undefined || offer.price < current) {
        priceByName.set(offer.marketHashName, offer.price);
      }
    }

    const priceFor = (name: string) => {
      for (const wear of WEAR_ORDER) {
        const price = priceByName.get(`${name} ${wear}`);
        if (price && price > 0) return price;
      }
      return priceByName.get(name) ?? 0;
    };

    const rows = catalogue
      .filter((s) => s?.name && s?.image)
      .map((s) => {
        const name = s.name!;
        return {
          slug: slugify(name),
          name,
          image_url: s.image ?? null,
          rarity: RARITY_MAP[String(s.rarity?.id ?? "")] ?? "milspec",
          weapon: s.weapon?.name ?? null,
          base_price: priceFor(name),
          is_active: true,
        };
      })
      .filter((r) => r.base_price > 0 && r.slug)
      .sort((a, b) => b.base_price - a.base_price)
      .slice(0, MAX_ITEMS);

    // de-dupe by slug
    const bySlug = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!bySlug.has(r.slug)) bySlug.set(r.slug, r);
    const unique = [...bySlug.values()];

    if (unique.length === 0) return { synced: 0, source: market.source, keyed: market.keyed };

    // Existing rows keep the admin's is_active flag; only new skins default to active.
    const existing = new Set<string>();
    for (let i = 0; i < unique.length; i += 200) {
      const slugs = unique.slice(i, i + 200).map((r) => r.slug);
      const { data } = await db.from("items").select("slug").in("slug", slugs);
      for (const row of (data ?? []) as { slug: string }[]) existing.add(row.slug);
    }

    // Two payloads with strictly uniform column sets: a mixed batch would make
    // PostgREST fill the missing `is_active` for known rows and reset admin flags.
    // `price_override` is in neither payload, so manual prices always survive.
    const updates = unique
      .filter((r) => existing.has(r.slug))
      .map(({ is_active: _ignored, ...rest }) => rest);
    const inserts = unique.filter((r) => !existing.has(r.slug));

    let synced = 0;
    for (const batch of [updates, inserts]) {
      for (let i = 0; i < batch.length; i += 100) {
        const chunk = batch.slice(i, i + 100);
        const { error } = await db
          .from("items")
          .upsert(chunk, { onConflict: "slug", defaultToNull: false });
        if (error) throw new Error(error.message || "Could not save the synced skins");
        synced += chunk.length;
      }
    }

    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "market_sync",
      target_type: "item",
      target_id: null,
      details: { synced, source: market.source, keyed: market.keyed },
    });

    return { synced, source: market.source, keyed: market.keyed };
  });
