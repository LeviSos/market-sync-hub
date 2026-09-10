import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicClient } from "./supabase-public";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** House edge applied to the fair win chance. */
export const HOUSE = 0.92;
export const MAX_CHANCE = 0.95;

export function upgradeChance(stake: number, targetValue: number) {
  if (stake <= 0 || targetValue <= 0) return 0;
  return Math.min(MAX_CHANCE, (stake / targetValue) * HOUSE);
}

/** Catalog of skins that can be targeted by the upgrader. */
export const listTargets = createServerFn({ method: "GET" })
  .inputValidator((d: { search?: string; min?: number; max?: number }) => ({
    search: String(d?.search ?? "").slice(0, 40),
    min: Number(d?.min ?? 0),
    max: Number(d?.max ?? 100000),
  }))
  .handler(async ({ data }) => {
    // Public catalog read: publishable key (RLS as anon), no service role needed.
    const db = publicClient();
    let q = db
      .from("items")
      .select("id, name, image_url, rarity, weapon, base_price, price_override")
      .eq("is_active", true)
      .gte("base_price", data.min)
      .lte("base_price", data.max)
      .order("base_price", { ascending: true })
      .limit(60);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    try {
      const { data: rows } = await q;
      if (rows && rows.length > 0) return rows;
    } catch {
      // no catalog rows yet — fall back to the demo catalog
    }
    const { mockTargets } = await import("./mock-catalog");
    return mockTargets({ search: data.search, min: data.min, max: data.max });
  });

export const runUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetId: string; inventoryIds?: string[]; stake?: number }) =>
    z
      .object({
        targetId: z.string().uuid(),
        inventoryIds: z.array(z.string().uuid()).max(10).optional(),
        stake: z.number().positive().max(100000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { roll } = await import("./fair.server");

    const { data: target } = await db
      .from("items")
      .select("id, name, image_url, rarity, base_price, price_override")
      .eq("id", data.targetId)
      .maybeSingle();
    if (!target) throw new Error("Target skin not found");
    const targetValue = Number(target.price_override ?? target.base_price);

    let stake = Number(data.stake ?? 0);
    const useItems = (data.inventoryIds?.length ?? 0) > 0;
    if (useItems) {
      const { data: inv } = await db
        .from("inventory_items")
        .select("id, value")
        .in("id", data.inventoryIds!)
        .eq("user_id", context.userId)
        .eq("status", "owned");
      if (!inv || inv.length !== data.inventoryIds!.length)
        throw new Error("Some items are no longer available");
      stake = inv.reduce((s, i) => s + Number(i.value), 0);
    }
    if (stake <= 0) throw new Error("Pick items or an amount to upgrade");
    if (stake >= targetValue) throw new Error("Pick a target worth more than your stake");

    const { data: seed } = await db
      .from("user_seeds")
      .select("server_seed, server_seed_hash, client_seed, nonce")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!seed) throw new Error("No active seed");

    const nonce = Number(seed.nonce) + 1;
    const r = roll(seed.server_seed, seed.client_seed, nonce);
    const chance = upgradeChance(stake, targetValue);
    const won = r < chance;

    const { data: res, error } = await db.rpc("fn_upgrade", {
      p_user: context.userId,
      p_inventory: useItems ? data.inventoryIds! : (null as unknown as string[]),
      p_stake: stake,
      p_target: target.id,
      p_chance: chance,
      p_roll: r,
      p_won: won,
      p_hash: seed.server_seed_hash,
      p_client_seed: seed.client_seed,
      p_nonce: nonce,
    });
    if (error) {
      throw new Error(
        error.message.includes("insufficient_funds")
          ? "Not enough balance"
          : "Could not run this upgrade",
      );
    }

    const out = res as { balance: number; target_value: number };
    return { won, chance, roll: r, stake, target, balance: Number(out.balance), nonce };
  });
