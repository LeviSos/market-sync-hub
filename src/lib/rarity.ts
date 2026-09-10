export type Rarity =
  | "consumer"
  | "industrial"
  | "milspec"
  | "restricted"
  | "classified"
  | "covert"
  | "exotic"
  | "contraband";

export const RARITY_LABEL: Record<Rarity, string> = {
  consumer: "Consumer",
  industrial: "Industrial",
  milspec: "Mil-Spec",
  restricted: "Restricted",
  classified: "Classified",
  covert: "Covert",
  exotic: "Exceedingly Rare",
  contraband: "Contraband",
};

export const RARITY_VAR: Record<Rarity, string> = {
  consumer: "var(--rarity-consumer)",
  industrial: "var(--rarity-industrial)",
  milspec: "var(--rarity-milspec)",
  restricted: "var(--rarity-restricted)",
  classified: "var(--rarity-classified)",
  covert: "var(--rarity-covert)",
  exotic: "var(--rarity-exotic)",
  contraband: "var(--rarity-contraband)",
};

export function rarityColor(rarity: string): string {
  return RARITY_VAR[rarity as Rarity] ?? RARITY_VAR.consumer;
}

/**
 * Amounts are shown in site coins, so this formats the number only — the coin
 * icon is rendered next to it by <Price /> from components/site/Coin.tsx.
 */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Knives, gloves and the rarest tiers get the golden "TOP DROP" treatment. */
export function isTopDrop(name: string | null | undefined, rarity: string | null | undefined) {
  const r = String(rarity ?? "");
  if (r === "covert" || r === "exotic" || r === "contraband") return true;
  const n = String(name ?? "").toLowerCase();
  return n.includes("★") || n.includes("knife") || n.includes("glove") || n.includes("karambit");
}
