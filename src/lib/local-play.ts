/**
 * Local (demo) play store.
 *
 * The site can be played while signed in through Steam only — that session has
 * no Supabase JWT, so every protected server function would answer
 * "Unauthorized: No authorization header provided". In that mode all game
 * actions are simulated here and persisted in localStorage instead.
 */
import { useCallback, useSyncExternalStore } from "react";
import { readBalanceOverride, setBalanceOverride } from "@/lib/admin-balances";
import { readSteamUser } from "@/lib/steam-auth";

export type LocalItem = {
  id: string;
  value: number;
  status: string;
  created_at: string;
  item: { id: string; name: string; image_url: string | null; rarity: string };
};

export type LocalMessage = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
};

export type LocalFlags = { is_muted: boolean; is_banned: boolean };

/** One skin the player received (case drop, upgrade win, contract output). */
export type HistoryItem = {
  id: string;
  name: string;
  image_url: string | null;
  rarity: string;
  value: number;
  source: "case" | "upgrade" | "contract";
  created_at: string;
};

/** One played round, shown in GAMES HISTORY. */
export type GameLog = {
  id: string;
  game: "case" | "upgrade" | "contract";
  detail: string;
  stake: number;
  payout: number;
  multiplier: number;
  won: boolean;
  created_at: string;
};

export type LocalState = {
  inventory: LocalItem[];
  chat: LocalMessage[];
  flags: Record<string, LocalFlags>;
  opened: number;
  upgrades: number;
  itemsHistory: HistoryItem[];
  gamesHistory: GameLog[];
  seed: { client_seed: string; server_seed_hash: string; nonce: number };
};

const KEY = "caseforge.play";
const EVENT = "caseforge:play";

function randomHex(bytes = 32) {
  const out = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(out);
  else for (let i = 0; i < bytes; i += 1) out[i] = Math.floor(Math.random() * 256);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newId() {
  return randomHex(8);
}

const EMPTY: LocalState = {
  inventory: [],
  chat: [],
  flags: {},
  opened: 0,
  upgrades: 0,
  itemsHistory: [],
  gamesHistory: [],
  seed: { client_seed: "", server_seed_hash: "", nonce: 0 },
};

let cache: LocalState = EMPTY;
let cacheRaw: string | null = null;

function normalise(input: Partial<LocalState> | null): LocalState {
  return {
    inventory: Array.isArray(input?.inventory) ? input!.inventory! : [],
    chat: Array.isArray(input?.chat) ? input!.chat! : [],
    flags: input?.flags && typeof input.flags === "object" ? input.flags : {},
    opened: Number(input?.opened ?? 0),
    upgrades: Number(input?.upgrades ?? 0),
    itemsHistory: Array.isArray(input?.itemsHistory) ? input!.itemsHistory! : [],
    gamesHistory: Array.isArray(input?.gamesHistory) ? input!.gamesHistory! : [],
    seed: {
      client_seed: input?.seed?.client_seed || randomHex(6),
      server_seed_hash: input?.seed?.server_seed_hash || randomHex(32),
      nonce: Number(input?.seed?.nonce ?? 0),
    },
  };
}

export function readPlay(): LocalState {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cacheRaw) return cache;
  try {
    cache = normalise(raw ? (JSON.parse(raw) as Partial<LocalState>) : null);
  } catch {
    cache = normalise(null);
  }
  cacheRaw = raw;
  return cache;
}

function write(next: LocalState) {
  if (typeof window === "undefined") return;
  cacheRaw = JSON.stringify(next);
  cache = next;
  window.localStorage.setItem(KEY, cacheRaw);
  window.dispatchEvent(new Event(EVENT));
}

export function updatePlay(fn: (state: LocalState) => LocalState) {
  write(fn(readPlay()));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Reactive view of the local play state. */
export function usePlay(): LocalState {
  return useSyncExternalStore(
    subscribe,
    () => readPlay(),
    () => EMPTY,
  );
}

export function usePlayActions() {
  return useCallback(updatePlay, []);
}

/* ------------------------------- balance ------------------------------- */

export function localPlayerId(): string | null {
  return readSteamUser()?.steamId ?? null;
}

export function readLocalBalance(id?: string | null): number {
  const steam = readSteamUser();
  const key = id ?? steam?.steamId ?? null;
  const override = readBalanceOverride(key);
  if (typeof override === "number") return override;
  return steam?.balance ?? 0;
}

export function addLocalBalance(delta: number, id?: string | null) {
  const key = id ?? localPlayerId();
  if (!key) return readLocalBalance(key);
  const next = Math.max(0, Math.round((readLocalBalance(key) + delta) * 100) / 100);
  setBalanceOverride(key, next);
  return next;
}

/* ------------------------------ inventory ------------------------------ */

export function addLocalItems(items: LocalItem[]) {
  updatePlay((s) => ({ ...s, inventory: [...items, ...s.inventory] }));
}

export function removeLocalItems(ids: string[]) {
  const set = new Set(ids);
  updatePlay((s) => ({ ...s, inventory: s.inventory.filter((i) => !set.has(i.id)) }));
}

/* --------------------------------- fair -------------------------------- */

export function bumpNonce() {
  updatePlay((s) => ({ ...s, seed: { ...s.seed, nonce: s.seed.nonce + 1 } }));
}

export function rotateLocalSeed() {
  const revealed = readPlay().seed.server_seed_hash || randomHex(32);
  const seed = randomHex(32);
  updatePlay((s) => ({
    ...s,
    seed: { client_seed: s.seed.client_seed, server_seed_hash: randomHex(32), nonce: 0 },
  }));
  return { revealed: revealed || seed, seed };
}

export function setLocalClientSeed(clientSeed: string) {
  updatePlay((s) => ({ ...s, seed: { ...s.seed, client_seed: clientSeed } }));
}

/* --------------------------------- chat -------------------------------- */

export function pushLocalMessage(msg: Omit<LocalMessage, "id" | "created_at" | "is_deleted">) {
  const row: LocalMessage = {
    ...msg,
    id: newId(),
    is_deleted: false,
    created_at: new Date().toISOString(),
  };
  updatePlay((s) => ({ ...s, chat: [...s.chat, row].slice(-100) }));
  return row;
}

export function deleteLocalMessage(id: string) {
  updatePlay((s) => ({
    ...s,
    chat: s.chat.map((m) => (m.id === id ? { ...m, is_deleted: true } : m)),
  }));
}

/* ------------------------------ moderation ----------------------------- */

export function readFlags(state: LocalState, id: string): LocalFlags {
  return state.flags[id] ?? { is_muted: false, is_banned: false };
}

export function setLocalFlags(id: string, patch: Partial<LocalFlags>) {
  updatePlay((s) => ({
    ...s,
    flags: { ...s.flags, [id]: { ...readFlags(s, id), ...patch } },
  }));
}

/* -------------------------------- rolling ------------------------------ */

/** Weighted pick used by the local case opening. */
export function weightedPick<T>(rows: { weight: number; item: T }[]): T | null {
  const total = rows.reduce((s, r) => s + Math.max(0, r.weight), 0);
  if (!rows.length || total <= 0) return rows[0]?.item ?? null;
  let r = Math.random() * total;
  for (const row of rows) {
    r -= Math.max(0, row.weight);
    if (r <= 0) return row.item;
  }
  return rows[rows.length - 1]!.item;
}

/* -------------------------------- history ------------------------------ */

/** Record skins the player received so the profile can list them. */
export function logItems(entries: Omit<HistoryItem, "id" | "created_at">[]) {
  if (entries.length === 0) return;
  const rows: HistoryItem[] = entries.map((e) => ({
    ...e,
    id: newId(),
    created_at: new Date().toISOString(),
  }));
  updatePlay((s) => ({ ...s, itemsHistory: [...rows, ...s.itemsHistory].slice(0, 200) }));
}

/** Record a played round (case open, upgrade, contract). */
export function logGame(entry: Omit<GameLog, "id" | "created_at">) {
  const row: GameLog = { ...entry, id: newId(), created_at: new Date().toISOString() };
  updatePlay((s) => ({ ...s, gamesHistory: [row, ...s.gamesHistory].slice(0, 200) }));
}
