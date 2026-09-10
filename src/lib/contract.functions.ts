import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** Contract payout band: 10% .. 150% of the input value, house edge folded in. */
export const CONTRACT_MIN = 0.1;
export const CONTRACT_MAX = 1.5;

export const runContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventoryIds: string[] }) =>
    z.object({ inventoryIds: z.array(z.string().uuid()).min(3).max(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { roll } = await import("./fair.server");

    const { data: inv } = await db
      .from("inventory_items")
      .select("id, value")
      .in("id", data.inventoryIds)
      .eq("user_id", context.userId)
      .eq("status", "owned");
    if (!inv || inv.length !== data.inventoryIds.length)
      throw new Error("Some items are no longer available");
    const input = inv.reduce((s, i) => s + Number(i.value), 0);

    const { data: seed } = await db
      .from("user_seeds")
      .select("server_seed, server_seed_hash, client_seed, nonce")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!seed) throw new Error("No active seed");

    const nonce = Number(seed.nonce) + 1;
    const r = roll(seed.server_seed, seed.client_seed, nonce);
    // Skewed roll: big wins are rare.
    const factor = CONTRACT_MIN + (CONTRACT_MAX - CONTRACT_MIN) * Math.pow(r, 2.2);
    const wanted = input * factor;

    const { data: pool } = await db
      .from("items")
      .select("id, name, image_url, rarity, base_price, price_override")
      .eq("is_active", true)
      .gte("base_price", input * CONTRACT_MIN * 0.5)
      .lte("base_price", input * CONTRACT_MAX * 1.5)
      .limit(300);
    const candidates = pool && pool.length > 0 ? pool : [];
    if (candidates.length === 0) throw new Error("No skins available for this contract");

    let picked = candidates[0]!;
    let best = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(Number(c.price_override ?? c.base_price) - wanted);
      if (diff < best) {
        best = diff;
        picked = c;
      }
    }

    const { data: res, error } = await db.rpc("fn_contract", {
      p_user: context.userId,
      p_inventory: data.inventoryIds,
      p_item: picked.id,
      p_roll: r,
      p_hash: seed.server_seed_hash,
      p_client_seed: seed.client_seed,
      p_nonce: nonce,
    });
    if (error) throw new Error("Could not forge this contract");

    const out = res as { input_value: number; output_value: number };
    return {
      item: picked,
      input: Number(out.input_value),
      output: Number(out.output_value),
      roll: r,
      nonce,
    };
  });
