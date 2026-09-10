import { loose } from "@/lib/supabase-loose";
import { roll } from "./fair.server";

type PoolEntry = {
  weight: number;
  item: { id: string; base_price: number; price_override: number | null };
};

/** Rolls every round of a battle and settles the pot. Server-only. */
export async function settleBattle(battleId: string) {
  const { supabaseAdmin: rawDb } = await import("@/integrations/supabase/client.server");
  const db = loose(rawDb);

  const { data: battle } = await db.from("battles").select("*").eq("id", battleId).maybeSingle();
  if (!battle || battle.status === "finished") return;

  const { data: seed } = await db
    .from("battle_seeds")
    .select("server_seed, client_seed")
    .eq("battle_id", battleId)
    .maybeSingle();
  if (!seed) return;

  const { data: cases } = await db
    .from("battle_cases")
    .select("position, case_id")
    .eq("battle_id", battleId)
    .order("position");
  if (!cases || cases.length === 0) return;

  const pools = new Map<string, PoolEntry[]>();
  for (const c of cases) {
    if (pools.has(c.case_id)) continue;
    const { data: pool } = await db
      .from("case_items")
      .select("weight, item:items(id, base_price, price_override)")
      .eq("case_id", c.case_id);
    pools.set(c.case_id, (pool ?? []) as unknown as PoolEntry[]);
  }

  const slots = Array.from({ length: battle.player_count }, (_, i) => i);
  const rounds: {
    round: number;
    slot: number;
    case_id: string;
    item_id: string;
    value: number;
    roll: number;
  }[] = [];
  const totals = new Map<number, number>(slots.map((s) => [s, 0]));

  for (const c of cases) {
    const pool = pools.get(c.case_id) ?? [];
    if (pool.length === 0) continue;
    const total = pool.reduce((s, p) => s + Number(p.weight), 0);
    for (const slot of slots) {
      const r = roll(seed.server_seed, seed.client_seed, c.position * 100 + slot);
      let ticket = r * total;
      let picked = pool[pool.length - 1]!;
      for (const p of pool) {
        ticket -= Number(p.weight);
        if (ticket <= 0) {
          picked = p;
          break;
        }
      }
      const value = Number(picked.item.price_override ?? picked.item.base_price);
      rounds.push({
        round: c.position,
        slot,
        case_id: c.case_id,
        item_id: picked.item.id,
        value,
        roll: r,
      });
      totals.set(slot, (totals.get(slot) ?? 0) + value);
    }
  }

  let winners: number[] = [];
  if (battle.mode === "team2v2") {
    const teamTotal = (team: number) =>
      slots.filter((s) => s % 2 === team).reduce((sum, s) => sum + (totals.get(s) ?? 0), 0);
    const a = teamTotal(0);
    const b = teamTotal(1);
    const team = a === b ? 0 : a > b ? 0 : 1;
    winners = slots.filter((s) => s % 2 === team);
  } else {
    const values = slots.map((s) => totals.get(s) ?? 0);
    const best = battle.mode === "crazy" ? Math.min(...values) : Math.max(...values);
    winners = slots.filter((s) => (totals.get(s) ?? 0) === best);
  }

  await db.rpc("fn_battle_settle", {
    p_battle: battleId,
    p_rounds: rounds,
    p_winner_slots: winners,
  });
}
