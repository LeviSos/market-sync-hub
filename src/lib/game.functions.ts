import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type CaseRow = { id: string; slug: string; name: string; price: number; is_active: boolean };
type PoolRow = { weight: number; item: ItemRow };
export type ItemRow = {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  rarity: string;
  weapon: string | null;
  base_price: number;
  price_override: number | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** Current player: profile, active seed hash, balance. */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();

    let { data: seed } = await db
      .from("user_seeds")
      .select("id, server_seed_hash, client_seed, nonce")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!seed) {
      const { newServerSeed } = await import("./fair.server");
      const { seed: s, hash } = newServerSeed();
      const { data: created } = await db
        .from("user_seeds")
        .insert({
          user_id: context.userId,
          server_seed: s,
          server_seed_hash: hash,
          client_seed: Math.random().toString(36).slice(2, 12),
        })
        .select("id, server_seed_hash, client_seed, nonce")
        .single();
      seed = created;
    }

    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    return { profile, seed, roles: (roles ?? []).map((r) => r.role) };
  });

export const setClientSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientSeed: string }) =>
    z.object({ clientSeed: z.string().trim().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db
      .from("user_seeds")
      .update({ client_seed: data.clientSeed })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    return { ok: true };
  });

/** Reveals the current server seed and starts a new one. */
export const rotateSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { newServerSeed } = await import("./fair.server");
    const { data: old } = await db
      .from("user_seeds")
      .select("id, server_seed, client_seed, nonce")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();

    if (old) {
      await db
        .from("user_seeds")
        .update({ is_active: false, revealed_at: new Date().toISOString() })
        .eq("id", old.id);
    }

    const { seed, hash } = newServerSeed();
    const { data: created } = await db
      .from("user_seeds")
      .insert({
        user_id: context.userId,
        server_seed: seed,
        server_seed_hash: hash,
        client_seed: Math.random().toString(36).slice(2, 12),
      })
      .select("id, server_seed_hash, client_seed, nonce")
      .single();

    return {
      revealed: old
        ? { serverSeed: old.server_seed, clientSeed: old.client_seed, nonce: old.nonce }
        : null,
      seed: created,
    };
  });

const TRADE_URL_RE =
  /^https?:\/\/(?:www\.)?steamcommunity\.com\/tradeoffer\/new\/?\?(?=[\s\S]*partner=\d+)(?=[\s\S]*token=[A-Za-z0-9_-]+)\S*$/i;

export const setTradeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tradeUrl: string }) =>
    z
      .object({
        tradeUrl: z
          .string()
          .trim()
          .max(255)
          .refine((v) => TRADE_URL_RE.test(v), "That is not a valid Steam trade link"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db.from("profiles").update({ trade_url: data.tradeUrl }).eq("id", context.userId);
    return { ok: true, tradeUrl: data.tradeUrl };
  });

/** Past (rotated) seeds with the revealed server seed, newest first. */
export const seedHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("user_seeds")
      .select(
        "id, client_seed, server_seed, server_seed_hash, nonce, created_at, revealed_at, is_active",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((s) => ({
      ...s,
      server_seed: s.is_active ? null : s.server_seed,
    }));
  });

/** Every case opening of the current player, newest first. */
export const itemsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("case_openings")
      .select(
        "id, cost, value, roll, nonce, created_at, item:items(name, image_url, rarity), case:cases(name, slug)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(60);
    return data ?? [];
  });

/** Upgrader history of the current player, newest first. */
export const gamesHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("upgrades")
      .select(
        "id, mode, stake, chance, target_value, won, roll, nonce, created_at, target:items!upgrades_target_item_id_fkey(name, image_url, rarity)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(60);
    return data ?? [];
  });

/** Sells every owned skin at once. */
export const sellAllItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("inventory_items")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "owned")
      .limit(200);

    let amount = 0;
    let sold = 0;
    for (const row of rows ?? []) {
      const { data: res, error } = await db.rpc("fn_sell_item", {
        p_user: context.userId,
        p_inventory: row.id,
      });
      if (error) continue;
      amount += Number((res as { amount: number }).amount ?? 0);
      sold += 1;
    }
    return { sold, amount };
  });

/** Adds test coins to the balance until payment providers are live. */
export const topUpBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) =>
    z.object({ amount: z.number().int().min(10).max(10_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("balance")
      .eq("id", context.userId)
      .single();
    const next = Number(profile?.balance ?? 0) + data.amount;
    await db.from("profiles").update({ balance: next }).eq("id", context.userId);
    const tx = crypto.randomUUID();
    await db.from("ledger_entries").insert([
      {
        tx_id: tx,
        user_id: null,
        account: "house_balance",
        direction: "debit",
        amount: data.amount,
        ref_type: "top_up",
        memo: "Top up",
      },
      {
        tx_id: tx,
        user_id: context.userId,
        account: "user_balance",
        direction: "credit",
        amount: data.amount,
        ref_type: "top_up",
        memo: "Top up",
      },
    ]);
    return { balance: next };
  });

/** Opens 1-5 copies of a case. Money movement happens atomically in the database. */
export const openCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseSlug: string; count: number }) =>
    z
      .object({ caseSlug: z.string().trim().max(80), count: z.number().int().min(1).max(5) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { roll } = await import("./fair.server");

    const { data: kase } = await db
      .from("cases")
      .select("id, slug, name, price, is_active")
      .eq("slug", data.caseSlug)
      .maybeSingle();
    if (!kase || !(kase as CaseRow).is_active) throw new Error("Case not found");

    const { data: poolRaw } = await db
      .from("case_items")
      .select(
        "weight, item:items(id, slug, name, image_url, rarity, weapon, base_price, price_override)",
      )
      .eq("case_id", (kase as CaseRow).id);
    const pool = (poolRaw ?? []) as unknown as PoolRow[];
    if (pool.length === 0) throw new Error("This case has no items yet");

    const { data: seed } = await db
      .from("user_seeds")
      .select("id, server_seed, server_seed_hash, client_seed, nonce")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!seed) throw new Error("No active seed");

    const total = pool.reduce((s, p) => s + p.weight, 0);
    const results: {
      item: ItemRow;
      value: number;
      roll: number;
      nonce: number;
      inventoryId: string;
      balance: number;
    }[] = [];

    for (let i = 0; i < data.count; i++) {
      const nonce = Number(seed.nonce) + i + 1;
      const r = roll(seed.server_seed, seed.client_seed, nonce);
      let ticket = r * total;
      let picked = pool[pool.length - 1]!;
      for (const p of pool) {
        ticket -= p.weight;
        if (ticket <= 0) {
          picked = p;
          break;
        }
      }

      const { data: res, error } = await db.rpc("fn_open_case", {
        p_user: context.userId,
        p_case: (kase as CaseRow).id,
        p_item: picked.item.id,
        p_roll: r,
        p_hash: seed.server_seed_hash,
        p_client_seed: seed.client_seed,
        p_nonce: nonce,
      });
      if (error)
        throw new Error(
          error.message.includes("insufficient_funds")
            ? "Not enough balance"
            : "Could not open case",
        );

      const out = res as { inventory_id: string; value: number; balance: number };
      results.push({
        item: picked.item,
        value: Number(out.value),
        roll: r,
        nonce,
        inventoryId: out.inventory_id,
        balance: Number(out.balance),
      });
    }

    return { results, pool: pool.map((p) => ({ ...p.item, weight: p.weight })), total };
  });

export const getInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("inventory_items")
      .select("id, value, status, created_at, item:items(id, name, image_url, rarity, weapon)")
      .eq("user_id", context.userId)
      .eq("status", "owned")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const sellItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventoryId: string }) =>
    z.object({ inventoryId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: res, error } = await db.rpc("fn_sell_item", {
      p_user: context.userId,
      p_inventory: data.inventoryId,
    });
    if (error) throw new Error("Could not sell this item");
    return res as { amount: number; balance: number };
  });

/** Demo top-up so the economy is testable before payment providers are live. */
export const claimStarterCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { count } = await db
      .from("ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("ref_type", "starter_credit");
    if ((count ?? 0) > 0) throw new Error("Starter credit already claimed");

    const { data: profile } = await db
      .from("profiles")
      .select("balance")
      .eq("id", context.userId)
      .single();
    const next = Number(profile?.balance ?? 0) + 100;
    await db.from("profiles").update({ balance: next }).eq("id", context.userId);
    const tx = crypto.randomUUID();
    await db.from("ledger_entries").insert([
      {
        tx_id: tx,
        user_id: null,
        account: "house_balance",
        direction: "debit",
        amount: 100,
        ref_type: "starter_credit",
        memo: "Starter credit",
      },
      {
        tx_id: tx,
        user_id: context.userId,
        account: "user_balance",
        direction: "credit",
        amount: 100,
        ref_type: "starter_credit",
        memo: "Starter credit",
      },
    ]);
    return { balance: next };
  });

/** Requests a Steam withdrawal for one owned item. The skin is reserved until staff send or reject it. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventoryId: string }) =>
    z.object({ inventoryId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: res, error } = await db.rpc("fn_request_withdrawal", {
      p_user: context.userId,
      p_inventory: data.inventoryId,
    });
    if (error) {
      if (/trade_url_missing/.test(error.message))
        throw new Error("Add your Steam trade link first");
      if (/item_not_available/.test(error.message))
        throw new Error("That skin is no longer available");
      throw new Error("Could not request this withdrawal");
    }
    return res as { withdrawal_id: string; value: number };
  });

/** The player's own withdrawal history. */
export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("withdrawals")
      .select(
        "id, value, status, trade_offer_id, note, created_at, item:items(name, image_url, rarity)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });
