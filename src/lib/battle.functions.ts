import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

export const BATTLE_MODES = ["ffa", "team2v2", "crazy"] as const;

export const listBattles = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db
    .from("battles")
    .select(
      "id, mode, status, player_count, rounds, cost, pot, created_at, battle_players(slot, username, avatar_url, is_bot, total_value), battle_cases(position, case:cases(name, image_url))",
    )
    .order("created_at", { ascending: false })
    .limit(24);
  return data ?? [];
});

export const getBattle = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: battle } = await db
      .from("battles")
      .select(
        "id, mode, status, player_count, rounds, cost, pot, winner_slots, server_seed_hash, client_seed, created_by, created_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!battle) return null;

    const [{ data: players }, { data: cases }, { data: rounds }] = await Promise.all([
      db
        .from("battle_players")
        .select("slot, team, user_id, username, avatar_url, is_bot, total_value")
        .eq("battle_id", data.id)
        .order("slot"),
      db
        .from("battle_cases")
        .select("position, case:cases(name, image_url, price)")
        .eq("battle_id", data.id)
        .order("position"),
      db
        .from("battle_rounds")
        .select("round, slot, value, item:items(name, image_url, rarity)")
        .eq("battle_id", data.id)
        .order("round"),
    ]);

    return { battle, players: players ?? [], cases: cases ?? [], rounds: rounds ?? [] };
  });

export const createBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode: string; players: number; caseSlugs: string[] }) =>
    z
      .object({
        mode: z.enum(BATTLE_MODES),
        players: z.number().int().min(2).max(4),
        caseSlugs: z.array(z.string().max(80)).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { newServerSeed } = await import("./fair.server");

    if (data.mode === "team2v2" && data.players !== 4)
      throw new Error("2v2 battles need 4 players");

    const { data: rows } = await db
      .from("cases")
      .select("id, slug")
      .in("slug", Array.from(new Set(data.caseSlugs)))
      .eq("is_active", true);
    const bySlug = new Map((rows ?? []).map((r) => [r.slug, r.id]));
    const caseIds = data.caseSlugs.map((s) => bySlug.get(s));
    if (caseIds.some((id) => !id)) throw new Error("One of those cases is unavailable");

    const { seed, hash } = newServerSeed();
    const clientSeed = Math.random().toString(36).slice(2, 12);

    const { data: battleId, error } = await db.rpc("fn_battle_create", {
      p_user: context.userId,
      p_mode: data.mode,
      p_players: data.players,
      p_cases: caseIds as string[],
      p_hash: hash,
      p_client_seed: clientSeed,
    });
    if (error) {
      throw new Error(
        error.message.includes("insufficient_funds")
          ? "Not enough balance"
          : "Could not create this battle",
      );
    }

    await db
      .from("battle_seeds")
      .insert({ battle_id: battleId as string, server_seed: seed, client_seed: clientSeed });
    return { id: battleId as string };
  });

export const joinBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { battleId: string; slot: number; bot?: boolean }) =>
    z
      .object({
        battleId: z.string().uuid(),
        slot: z.number().int().min(0).max(3),
        bot: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: res, error } = await db.rpc("fn_battle_join", {
      p_user: context.userId,
      p_battle: data.battleId,
      p_slot: data.slot,
      p_bot: Boolean(data.bot),
    });
    if (error) {
      const m = error.message;
      throw new Error(
        m.includes("insufficient_funds")
          ? "Not enough balance"
          : m.includes("slot_taken")
            ? "That seat was just taken"
            : m.includes("already_joined")
              ? "You are already in this battle"
              : "Could not join this battle",
      );
    }

    const out = res as { filled: number; player_count: number };
    if (Number(out.filled) >= Number(out.player_count)) {
      const { settleBattle } = await import("./battle.server");
      await settleBattle(data.battleId);
      return { ...out, started: true };
    }
    return { ...out, started: false };
  });
