import { useEffect, useState } from "react";
import { readSteamUser, saveSteamUser } from "@/lib/steam-auth";

/**
 * Local balance overrides applied by the staff panel.
 *
 * Keyed by player id (Supabase profile id or Steam id). Stored locally so a
 * change shows up instantly in the header and on the profile page, even when
 * the backend call is unavailable.
 */

const KEY = "caseforge.balances";
export const BALANCE_EVENT = "caseforge:balances";

type Overrides = Record<string, number>;

export function readBalanceOverrides(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Overrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function readBalanceOverride(id: string | null | undefined): number | null {
  if (!id) return null;
  const value = readBalanceOverrides()[id];
  return typeof value === "number" ? value : null;
}

export function setBalanceOverride(id: string, balance: number) {
  if (typeof window === "undefined") return;
  const next = { ...readBalanceOverrides(), [id]: Math.max(0, Math.round(balance * 100) / 100) };
  window.localStorage.setItem(KEY, JSON.stringify(next));

  // Keep the locally stored Steam account in sync so the header updates too.
  const steam = readSteamUser();
  if (steam && steam.steamId === id) saveSteamUser({ ...steam, balance: next[id]! });

  window.dispatchEvent(new Event(BALANCE_EVENT));
}

export function useBalanceOverrides(): Overrides {
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    const sync = () => setOverrides(readBalanceOverrides());
    sync();
    window.addEventListener(BALANCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BALANCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return overrides;
}
