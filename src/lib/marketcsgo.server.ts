/**
 * MarketCSGO (market.csgo.com / CSGO.TM) client.
 *
 * Provider rules honoured here:
 *  - hard limit of 5 requests per second (exceeding it voids the API key);
 *  - public price endpoints work without any key and are used as a fallback;
 *  - private endpoints are only touched when MARKET_CSGO_API_KEY is present.
 */

const BASE = "https://market.csgo.com/api";
const TIMEOUT_MS = 25_000;
export const MARKET_TIMEOUT = "MARKET_TIMEOUT";

export type Currency = "USD" | "EUR" | "RUB";

export type MarketOffer = {
  marketHashName: string;
  /** Best current asking price, in the requested currency. */
  price: number;
  /** Highest standing buy order, when the endpoint provides one. */
  buyOrder: number | null;
  avgPrice: number | null;
  volume: number | null;
};

/* ------------------------- rate limiting (5 rps) -------------------------- */

const MIN_GAP_MS = 220; // ~4.5 requests per second, safely under the cap
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialises every provider call and spaces them out to respect the limit. */
export function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCall = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  return throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "CaseForge/1.0" },
      });
      if (!res.ok) throw new Error(`Market responded with ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new Error(MARKET_TIMEOUT);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

export function marketApiKey(): string | undefined {
  const raw = process.env["MARKET_CSGO_API_KEY"];
  return raw && raw.trim() !== "" ? raw.trim() : undefined;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/* ----------------------------- public prices ------------------------------ */

type SimplePriceResponse = {
  success?: boolean;
  items?: Array<{
    market_hash_name?: string;
    price?: string | number;
    volume?: string | number;
  }>;
};

/** https://market.csgo.com/api/v2/prices/{currency}.json — no key required. */
export async function fetchSimplePrices(currency: Currency = "USD"): Promise<MarketOffer[]> {
  const json = await getJson<SimplePriceResponse>(`${BASE}/v2/prices/${currency}.json`);
  return (json.items ?? [])
    .filter((row) => row?.market_hash_name)
    .map((row) => ({
      marketHashName: String(row.market_hash_name),
      price: num(row.price),
      buyOrder: null,
      avgPrice: null,
      volume: row.volume === undefined ? null : Number(row.volume) || 0,
    }))
    .filter((row) => row.price > 0);
}

type ClassInstanceResponse = {
  success?: boolean;
  currency?: string;
  items?: Record<
    string,
    {
      price?: string | number;
      buy_order?: string | number;
      avg_price?: string | number;
      market_hash_name?: string;
      popularity_7d?: string | number;
    }
  >;
};

/**
 * https://market.csgo.com/api/v2/prices/class_instance/{currency}.json
 * Richer than the simple list: carries buy_order and avg_price.
 */
export async function fetchClassInstancePrices(currency: Currency = "USD"): Promise<MarketOffer[]> {
  const json = await getJson<ClassInstanceResponse>(
    `${BASE}/v2/prices/class_instance/${currency}.json`,
  );
  const out = new Map<string, MarketOffer>();
  for (const row of Object.values(json.items ?? {})) {
    const name = row?.market_hash_name;
    if (!name) continue;
    const price = num(row.price);
    if (price <= 0) continue;
    const existing = out.get(name);
    if (existing && existing.price <= price) continue;
    out.set(name, {
      marketHashName: name,
      price,
      buyOrder: num(row.buy_order) || null,
      avgPrice: num(row.avg_price) || null,
      volume: row.popularity_7d === undefined ? null : Number(row.popularity_7d) || 0,
    });
  }
  return [...out.values()];
}

/* --------------------------- full export (2 step) -------------------------- */

type FullExportIndex = { success?: boolean; format?: string[]; items?: string[] };

/**
 * Two-step public export: the index lists chunk files, each chunk holds the
 * current offers. Only the first few chunks are read so a sync stays inside a
 * request budget and the rate limit.
 */
export async function fetchFullExport(currency: Currency = "USD", maxChunks = 3) {
  const index = await getJson<FullExportIndex>(`${BASE}/full-export/${currency}.json`);
  const format = index.format ?? [];
  const nameAt = format.indexOf("market_hash_name");
  const priceAt = format.indexOf("price");
  if (nameAt < 0 || priceAt < 0) return [] as MarketOffer[];

  const offers = new Map<string, MarketOffer>();
  for (const file of (index.items ?? []).slice(0, maxChunks)) {
    const url = file.startsWith("http") ? file : `${BASE}/full-export/${file}`;
    let chunk: unknown[][] = [];
    try {
      chunk = await getJson<unknown[][]>(url);
    } catch {
      continue; // a missing chunk must not fail the whole sync
    }
    for (const row of chunk) {
      const name = String(row?.[nameAt] ?? "");
      const price = num(row?.[priceAt]);
      if (!name || price <= 0) continue;
      const existing = offers.get(name);
      if (existing && existing.price <= price) continue;
      offers.set(name, { marketHashName: name, price, buyOrder: null, avgPrice: null, volume: null });
    }
  }
  return [...offers.values()];
}

/* ------------------------------ private API -------------------------------- */

/** https://market.csgo.com/api/v2/stickers — requires the private key. */
export async function fetchStickers(lang: "ru" | "en" = "en") {
  const key = marketApiKey();
  if (!key) return [] as Array<{ name: string; price: number }>;
  const json = await getJson<{
    success?: boolean;
    items?: Array<{ name?: string; market_hash_name?: string; price?: string | number }>;
  }>(`${BASE}/v2/stickers?key=${encodeURIComponent(key)}&lang=${lang}`);
  return (json.items ?? [])
    .map((row) => ({
      name: String(row.market_hash_name ?? row.name ?? ""),
      price: num(row.price),
    }))
    .filter((row) => row.name && row.price > 0);
}

/** Short-lived (10 min) token for wss://wsprice.csgo.com/connection/websocket. */
export async function fetchWsToken(): Promise<string | null> {
  const key = marketApiKey();
  if (!key) return null;
  try {
    const json = await getJson<{ success?: boolean; token?: string }>(
      `${BASE}/v2/get-ws-token?key=${encodeURIComponent(key)}`,
    );
    return json.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Best available price feed.
 *  - With a private key: class/instance feed (richest) with the simple list as
 *    a backup, both throttled to the provider limit.
 *  - Without a key: the same public endpoints, so the catalogue still fills.
 */
export async function fetchMarketOffers(currency: Currency = "USD"): Promise<{
  offers: MarketOffer[];
  source: "class_instance" | "prices" | "full_export";
  keyed: boolean;
}> {
  const keyed = Boolean(marketApiKey());
  try {
    const offers = await fetchClassInstancePrices(currency);
    if (offers.length > 0) return { offers, source: "class_instance", keyed };
  } catch (error) {
    if (error instanceof Error && error.message === MARKET_TIMEOUT) throw error;
  }
  try {
    const offers = await fetchSimplePrices(currency);
    if (offers.length > 0) return { offers, source: "prices", keyed };
  } catch (error) {
    if (error instanceof Error && error.message === MARKET_TIMEOUT) throw error;
  }
  const offers = await fetchFullExport(currency);
  return { offers, source: "full_export", keyed };
}
