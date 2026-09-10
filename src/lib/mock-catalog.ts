/**
 * Local demo catalog.
 *
 * Used whenever the database has no rows yet, so the whole site (home page,
 * case pages, live drops, inventory and the upgrader) stays populated and
 * playable. Skin names match the official CS2 names, so artwork resolves from
 * the public CS2 API through `useSkinImages`.
 */

import { computeCasePrice } from "@/lib/pricing";

export type MockItem = {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  rarity: string;
  weapon: string | null;
  base_price: number;
  price_override: number | null;
  is_active: boolean;
};

export type MockCase = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  price: number;
  tag: string | null;
  image_url: string | null;
  case_items: { weight: number; item: MockItem }[];
};

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type Seed = [name: string, weapon: string, rarity: string, price: number];

const SEEDS: Seed[] = [
  ["AK-47 | Redline", "AK-47", "classified", 42],
  ["AK-47 | Asiimov", "AK-47", "covert", 96],
  ["AK-47 | Neon Rider", "AK-47", "covert", 145],
  ["AK-47 | Fire Serpent", "AK-47", "covert", 1450],
  ["AWP | Asiimov", "AWP", "covert", 210],
  ["AWP | Neo-Noir", "AWP", "covert", 190],
  ["AWP | Wildfire", "AWP", "covert", 320],
  ["AWP | Dragon Lore", "AWP", "covert", 9800],
  ["M4A4 | Howl", "M4A4", "contraband", 5400],
  ["M4A4 | Desolate Space", "M4A4", "classified", 38],
  ["M4A1-S | Hyper Beast", "M4A1-S", "covert", 78],
  ["M4A1-S | Printstream", "M4A1-S", "covert", 260],
  ["Desert Eagle | Blaze", "Desert Eagle", "restricted", 480],
  ["Desert Eagle | Printstream", "Desert Eagle", "covert", 165],
  ["USP-S | Kill Confirmed", "USP-S", "covert", 88],
  ["USP-S | Neo-Noir", "USP-S", "classified", 34],
  ["Glock-18 | Fade", "Glock-18", "restricted", 420],
  ["Glock-18 | Water Elemental", "Glock-18", "restricted", 12],
  ["P250 | Asiimov", "P250", "restricted", 9],
  ["MP9 | Starlight Protector", "MP9", "covert", 28],
  ["SSG 08 | Blood in the Water", "SSG 08", "classified", 45],
  ["FAMAS | Roll Cage", "FAMAS", "mil-spec", 6],
  ["Galil AR | Chatterbox", "Galil AR", "covert", 52],
  ["Five-SeveN | Case Hardened", "Five-SeveN", "restricted", 24],
  ["Nova | Hyper Beast", "Nova", "mil-spec", 7],
  ["UMP-45 | Primal Saber", "UMP-45", "restricted", 11],
  ["Karambit | Doppler", "Karambit", "covert", 2100],
  ["Karambit | Fade", "Karambit", "covert", 3600],
  ["Butterfly Knife | Slaughter", "Butterfly Knife", "covert", 2450],
  ["M9 Bayonet | Marble Fade", "M9 Bayonet", "covert", 2750],
  ["Bayonet | Tiger Tooth", "Bayonet", "covert", 1350],
  ["Sport Gloves | Pandora's Box", "Sport Gloves", "covert", 3100],
  ["Specialist Gloves | Crimson Kimono", "Specialist Gloves", "covert", 2200],
  ["Driver Gloves | King Snake", "Driver Gloves", "covert", 1400],
];

export const MOCK_ITEMS: MockItem[] = SEEDS.map(([name, weapon, rarity, price], i) => ({
  id: uuid(i + 1),
  slug: slugify(name),
  name,
  image_url: null,
  rarity,
  weapon,
  base_price: price,
  price_override: null,
  is_active: true,
}));

function byName(name: string) {
  return MOCK_ITEMS.find((i) => i.name === name)!;
}

function pool(names: string[]) {
  return names.map((name) => {
    const item = byName(name);
    // Cheaper skins drop far more often than the expensive ones.
    const weight = Math.max(1, Math.round(10000 / (item.base_price + 5)));
    return { weight, item };
  });
}

type CaseSeed = [name: string, category: string, tag: string | null, names: string[]];

const CASE_SEEDS: CaseSeed[] = [
  [
    "Starter Crate",
    "budget",
    "new",
    [
      "P250 | Asiimov",
      "Nova | Hyper Beast",
      "FAMAS | Roll Cage",
      "UMP-45 | Primal Saber",
      "Glock-18 | Water Elemental",
      "USP-S | Neo-Noir",
    ],
  ],
  [
    "Neon Riot",
    "popular",
    "hot",
    [
      "AK-47 | Neon Rider",
      "MP9 | Starlight Protector",
      "USP-S | Kill Confirmed",
      "Galil AR | Chatterbox",
      "M4A4 | Desolate Space",
      "AK-47 | Redline",
    ],
  ],
  [
    "Sniper's Nest",
    "popular",
    null,
    [
      "AWP | Asiimov",
      "AWP | Neo-Noir",
      "SSG 08 | Blood in the Water",
      "AWP | Wildfire",
      "AK-47 | Asiimov",
      "M4A1-S | Hyper Beast",
    ],
  ],
  [
    "Pistol Kings",
    "budget",
    null,
    [
      "Desert Eagle | Printstream",
      "Glock-18 | Fade",
      "Five-SeveN | Case Hardened",
      "USP-S | Kill Confirmed",
      "P250 | Asiimov",
      "Desert Eagle | Blaze",
    ],
  ],
  [
    "Knife Vault",
    "premium",
    "knives",
    [
      "Karambit | Doppler",
      "Karambit | Fade",
      "Butterfly Knife | Slaughter",
      "M9 Bayonet | Marble Fade",
      "Bayonet | Tiger Tooth",
      "AK-47 | Fire Serpent",
    ],
  ],
  [
    "Glove Locker",
    "premium",
    null,
    [
      "Sport Gloves | Pandora's Box",
      "Specialist Gloves | Crimson Kimono",
      "Driver Gloves | King Snake",
      "M4A1-S | Printstream",
      "AWP | Wildfire",
      "AK-47 | Asiimov",
    ],
  ],
  [
    "Grail Chamber",
    "premium",
    "rare",
    [
      "AWP | Dragon Lore",
      "M4A4 | Howl",
      "AK-47 | Fire Serpent",
      "Karambit | Fade",
      "Sport Gloves | Pandora's Box",
      "Desert Eagle | Blaze",
    ],
  ],
];

export const MOCK_CASES: MockCase[] = CASE_SEEDS.map(([name, category, tag, names], i) => {
  const case_items = pool(names);
  return {
    id: uuid(100 + i),
    slug: slugify(name),
    name,
    category,
    // No hardcoded price: it always follows the skins inside the case.
    price: computeCasePrice(case_items),
    tag,
    image_url: null,
    case_items,
  };
});

export function mockCase(slug: string) {
  return MOCK_CASES.find((c) => c.slug === slug) ?? null;
}

const DROP_NAMES = [
  "Skywalker",
  "n0va",
  "Мурзик",
  "kaizen",
  "Pixel",
  "dropTable",
  "Лютый",
  "AceHigh",
];

/** Deterministic-looking demo feed for the live drops rail. */
export function mockDrops(count = 16) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const item = MOCK_ITEMS[(i * 5 + 3) % MOCK_ITEMS.length]!;
    const kase = MOCK_CASES[i % MOCK_CASES.length]!;
    return {
      id: `mock-drop-${i}`,
      username: DROP_NAMES[i % DROP_NAMES.length]!,
      avatar_url: null,
      value: item.base_price,
      created_at: new Date(now - i * 47_000).toISOString(),
      item: { name: item.name, image_url: null, rarity: item.rarity },
      case: { name: kase.name, slug: kase.slug },
    };
  });
}

/** Demo inventory so the inventory page and upgrader are usable without data. */
export function mockInventory() {
  return [0, 4, 9, 14, 18, 20, 23, 26].map((idx, i) => {
    const item = MOCK_ITEMS[idx % MOCK_ITEMS.length]!;
    return {
      id: uuid(500 + i),
      value: item.base_price,
      status: "available",
      created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
      item: {
        id: item.id,
        name: item.name,
        image_url: null,
        rarity: item.rarity,
      },
    };
  });
}

export function mockTargets(opts: { search?: string; min?: number; max?: number }) {
  const search = (opts.search ?? "").toLowerCase();
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  return MOCK_ITEMS.filter(
    (i) =>
      i.base_price >= min &&
      i.base_price <= max &&
      (!search || i.name.toLowerCase().includes(search)),
  ).sort((a, b) => a.base_price - b.base_price);
}
