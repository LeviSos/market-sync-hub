/**
 * Market sync: pulls the public CS2 skin catalogue and current market prices,
 * then refreshes the `items` table. Manual price overrides are never touched.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loose } from "@/lib/supabase-loose";

const SKINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
const PRICES_URL =
  "https://raw.githubusercontent.com/ByMykel/counter-strike-price-tracker/main/static/prices.json";

const MAX_ITEMS = 600;
const MARKET_TIMEOUT_MS = 20_000;
const MARKET_TIMEOUT = "MARKET_TIMEOUT";

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARKET_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type ApiSkin = {
  name?: string;
  weapon?: { name?: string } | null;
  rarity?: { id?: string; name?: string } | null;
  image?: string;
};

type PriceRow = {
  steam?: { last_24h?: number | null; last_7d?: number | null; last_30d?: number | null } | null;
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

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function priceOf(row: PriceRow | undefined) {
  const p = row?.steam?.last_24h ?? row?.steam?.last_7d ?? row?.steam?.last_30d ?? null;
  const n = Number(p ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export const marketSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = loose(supabaseAdmin);

    const { requireStaffRoles } = await import("@/lib/staff-guard");
    await requireStaffRoles(db, context.userId);

    let skinsRes: Response;
    let pricesRes: Response | null = null;
    try {
      [skinsRes, pricesRes] = await Promise.all([
        fetchWithTimeout(SKINS_URL),
        fetchWithTimeout(PRICES_URL).catch(() => null as unknown as Response),
      ]);
    } catch (err) {
      const timedOut =
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new Error(
        timedOut ? MARKET_TIMEOUT : "Market catalogue is unavailable right now",
      );
    }
    if (!skinsRes.ok) throw new Error("Market catalogue is unavailable right now");
    const skins = (await skinsRes.json()) as ApiSkin[];
    const prices =
      pricesRes && pricesRes.ok ? ((await pricesRes.json()) as Record<string, PriceRow>) : {};

    // Keep the most valuable / most recognisable part of the catalogue.
    const rows = skins
      .filter((s) => s?.name && s?.image)
      .map((s) => {
        const name = s.name!;
        const price =
          priceOf(prices[`${name} (Field-Tested)`]) ||
          priceOf(prices[`${name} (Minimal Wear)`]) ||
          priceOf(prices[`${name} (Factory New)`]) ||
          priceOf(prices[name]);
        return {
          slug: slugify(name),
          name,
          image_url: s.image ?? null,
          rarity: RARITY_MAP[String(s.rarity?.id ?? "")] ?? "milspec",
          weapon: s.weapon?.name ?? null,
          base_price: price,
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
      details: { synced },
    });

    return { synced };
  });
