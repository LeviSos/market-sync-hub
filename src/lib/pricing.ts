/**
 * Dynamic case pricing.
 *
 * A case never carries a hardcoded price: it is derived from the skins in its
 * drop pool (weighted expected value) divided by the target return-to-player,
 * so the price always follows the pool it contains.
 */

export type PricedItem = {
  base_price?: number | string | null;
  price_override?: number | string | null;
};

export type PoolRow = { weight?: number | string | null; item?: PricedItem | null };

/** Effective value of one skin: a manual override always wins. */
export function itemValue(item: PricedItem | null | undefined): number {
  const override = item?.price_override;
  const n = Number(override ?? item?.base_price ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Weighted average value a player can expect from one open. */
export function poolExpectedValue(pool: PoolRow[] | null | undefined): number {
  const rows = (pool ?? []).filter((r) => r?.item);
  if (rows.length === 0) return 0;
  let weightSum = 0;
  let valueSum = 0;
  for (const row of rows) {
    const w = Math.max(0, Number(row.weight ?? 1) || 0);
    weightSum += w;
    valueSum += w * itemValue(row.item);
  }
  if (weightSum <= 0) {
    return rows.reduce((s, r) => s + itemValue(r.item), 0) / rows.length;
  }
  return valueSum / weightSum;
}

/**
 * Price of one open. `rtp` is the share of the price returned to players on
 * average (92 % by default, matching the staff panel setting).
 */
export function computeCasePrice(pool: PoolRow[] | null | undefined, rtp = 92): number {
  const ev = poolExpectedValue(pool);
  if (ev <= 0) return 0;
  const share = Math.min(Math.max(Number(rtp) || 92, 50), 100) / 100;
  const raw = ev / share;
  const rounded = raw >= 100 ? Math.round(raw) : Math.round(raw * 100) / 100;
  return Math.max(1, rounded);
}

/**
 * Price to show for a case. The pool always wins when it is known, so the
 * price scales with the skins inside; the stored price is only a fallback for
 * cases whose pool hasn't been loaded.
 */
export function casePrice(
  stored: number | string | null | undefined,
  pool: PoolRow[] | null | undefined,
  rtp = 92,
): number {
  const fromPool = computeCasePrice(pool, rtp);
  if (fromPool > 0) return fromPool;
  const n = Number(stored ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

