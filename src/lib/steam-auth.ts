import { useEffect, useState } from "react";

export type SteamUser = {
  steamId: string;
  username: string;
  avatarUrl: string | null;
  balance: number;
};

const KEY = "caseforge.steam";
const EVENT = "caseforge:steam-auth";
const DEFAULT_AVATAR =
  "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

export function readSteamUser(): SteamUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem("steam_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SteamUser> & { steamId?: string; avatar?: string };
    if (!parsed.steamId) return null;
    return {
      steamId: parsed.steamId,
      username: parsed.username || `Player ${parsed.steamId.slice(-4)}`,
      avatarUrl: parsed.avatarUrl ?? parsed.avatar ?? DEFAULT_AVATAR,
      balance: typeof parsed.balance === "number" ? parsed.balance : 0,
    };
  } catch {
    return null;
  }
}

export function saveSteamUser(user: {
  steamId: string;
  username?: string | null;
  avatarUrl?: string | null;
  balance?: number | null;
}) {
  if (typeof window === "undefined") return;
  const previous = readSteamUser();
  const value: SteamUser = {
    steamId: user.steamId,
    username: user.username?.trim() || previous?.username || `Player ${user.steamId.slice(-4)}`,
    avatarUrl: user.avatarUrl || previous?.avatarUrl || DEFAULT_AVATAR,
    balance: user.balance ?? previous?.balance ?? 0,
  };
  window.localStorage.setItem(KEY, JSON.stringify(value));
  // Mirror under the plain key so any other reader stays in sync.
  window.localStorage.setItem("steam_user", JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT));
}

export function clearSteamUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem("steam_user");
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Reads a Steam OpenID / callback response out of the current URL, stores the
 * user and strips the query string so the address bar stays clean.
 * Returns the stored user when something was captured.
 */
export function captureSteamUserFromUrl(): SteamUser | null {
  if (typeof window === "undefined") return null;
  // /auth/complete runs its own handler (it also needs the token_hash param).
  if (window.location.pathname.startsWith("/auth/complete")) return null;
  const params = new URLSearchParams(window.location.search);

  const claimed = params.get("openid.claimed_id") ?? params.get("openid.identity") ?? "";
  const steamId = params.get("steam_id") ?? /\/(\d{17})\/?$/.exec(claimed)?.[1] ?? null;
  if (!steamId) return null;

  saveSteamUser({
    steamId,
    username: params.get("steam_name"),
    avatarUrl: params.get("steam_avatar"),
  });

  window.history.replaceState({}, document.title, window.location.pathname);
  return readSteamUser();
}

export function useSteamUser() {
  const [user, setUser] = useState<SteamUser | null>(null);

  useEffect(() => {
    const sync = () => setUser(readSteamUser());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return user;
}

export const steamAvatarFallback = DEFAULT_AVATAR;
