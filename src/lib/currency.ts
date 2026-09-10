/**
 * Site currency.
 *
 * The platform has a single currency: the yellow site coin. Amounts are always
 * shown as plain numbers next to the coin icon (see <Price /> in Coin.tsx) —
 * no real-world currency symbols anywhere. Only the number formatting follows
 * the selected language (thousands separators / decimal mark).
 */
import { useI18n, type Lang } from "@/lib/i18n";

const LOCALE: Record<Lang, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

export function formatPrice(coins: number | string | null | undefined, lang: Lang = "en"): string {
  const n = Number(coins ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString(LOCALE[lang] ?? "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Reactive currency helpers for components. */
export function useCurrency() {
  const { lang } = useI18n();
  return {
    lang,
    format: (coins: number | string | null | undefined) => formatPrice(coins, lang),
  };
}
