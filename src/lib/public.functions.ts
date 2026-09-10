import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./supabase-public";
import { MOCK_CASES, mockCase, mockDrops } from "./mock-catalog";

type ItemCard = {
  id: string;
  slug?: string;
  name: string;
  image_url: string | null;
  rarity: string;
  weapon?: string | null;
  base_price: number;
};

type CaseCard = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  price: number;
  tag: string | null;
  image_url: string | null;
  case_items: { weight: number; item: ItemCard | null }[];
};

type PoolCard = { weight: number; item: ItemCard | null };

type Drop = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  value: number;
  created_at: string;
  item: { name: string; image_url: string | null; rarity: string } | null;
  case: { name: string; slug: string } | null;
};

export const listCases = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = publicClient();
    const { data } = await db
      .from("cases")
      .select(
        "id, slug, name, category, price, tag, image_url, case_items(weight, item:items(id, name, image_url, rarity, base_price))",
      )
      .eq("is_active", true)
      .order("price");
    const rows = (data ?? []) as unknown as CaseCard[];
    if (rows.length > 0) return rows;
  } catch {
    // no database rows yet — fall through to the demo catalog
  }
  return MOCK_CASES as unknown as CaseCard[];
});

export const getCase = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d.slug).slice(0, 80) }))
  .handler(async ({ data }) => {
    try {
      const db = publicClient();
      const { data: kase } = await db
        .from("cases")
        .select("id, slug, name, category, price, tag, image_url")
        .eq("slug", data.slug)
        .maybeSingle();
      if (kase) {
        const { data: pool } = await db
          .from("case_items")
          .select("weight, item:items(id, slug, name, image_url, rarity, weapon, base_price)")
          .eq("case_id", kase.id);
        return { kase, pool: (pool ?? []) as unknown as PoolCard[] };
      }
    } catch {
      // fall through to the demo catalog
    }
    const demo = mockCase(data.slug);
    if (!demo) return null;
    const { case_items, ...kase } = demo;
    return { kase, pool: case_items as unknown as PoolCard[] };
  });

export const liveDrops = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = publicClient();
    const { data } = await db
      .from("case_openings")
      .select(
        "id, username, avatar_url, value, created_at, item:items(name, image_url, rarity), case:cases(name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as unknown as Drop[];
    if (rows.length > 0) return rows;
  } catch {
    // fall through to the demo feed
  }
  return mockDrops() as unknown as Drop[];
});
