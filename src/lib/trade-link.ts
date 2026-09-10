const KEY = "caseforge.trade_url";

/**
 * Accepts any valid Steam trade offer link:
 * https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc
 * (http/https, with or without www, params in any order).
 */
export const TRADE_URL_RE =
  /^https?:\/\/(?:www\.)?steamcommunity\.com\/tradeoffer\/new\/?\?(?=[^\s]*partner=\d+)(?=[^\s]*token=[A-Za-z0-9_-]+)\S+$/i;

export function isValidTradeUrl(value: string) {
  return TRADE_URL_RE.test(value.trim());
}

export function readTradeUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveTradeUrlLocally(value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, value.trim());
  } catch {
    /* storage unavailable — ignore */
  }
}
