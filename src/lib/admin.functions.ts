import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaff, requireStaffRoles } from "@/lib/staff-guard";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** Throws unless the caller has a staff role row (owner ids self-provision). */
async function requireStaff(userId: string) {
  const db = await admin();
  const { roles, isAdmin } = await requireStaffRoles(db, userId);
  return { db, roles, isAdmin };
}

export const amIStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { roles, isStaff, isAdmin } = await resolveStaff(db, context.userId);
    return { staff: isStaff, roles, admin: isAdmin };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);

    const counts = await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("case_openings").select("id", { count: "exact", head: true }),
      db.from("battles").select("id", { count: "exact", head: true }),
      db.from("chat_messages").select("id", { count: "exact", head: true }).eq("is_deleted", false),
      db.from("inventory_items").select("id", { count: "exact", head: true }).eq("status", "owned"),
    ]);

    const { data: balances } = await db.from("profiles").select("balance").limit(2000);
    const totalBalance = (balances ?? []).reduce((s, r) => s + Number(r.balance ?? 0), 0);

    const { data: recent } = await db
      .from("case_openings")
      .select("value")
      .order("created_at", { ascending: false })
      .limit(500);
    const recentValue = (recent ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);

    return {
      users: counts[0]?.count ?? 0,
      openings: counts[1]?.count ?? 0,
      battles: counts[2]?.count ?? 0,
      messages: counts[3]?.count ?? 0,
      items: counts[4]?.count ?? 0,
      totalBalance,
      recentValue,
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { search?: string }) =>
    z.object({ search: z.string().max(60).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    let q = db
      .from("profiles")
      .select("id, username, avatar_url, balance, level, xp, is_banned, is_muted, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.search) q = q.ilike("username", `%${data.search}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; amount: number; memo?: string }) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().min(-100000).max(100000),
        memo: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const { data: profile } = await db
      .from("profiles")
      .select("balance")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile) throw new Error("Player not found");

    const next = Number(profile.balance ?? 0) + data.amount;
    if (next < 0) throw new Error("Balance cannot go below zero");
    await db.from("profiles").update({ balance: next }).eq("id", data.userId);

    const tx = crypto.randomUUID();
    await db.from("ledger_entries").insert([
      {
        tx_id: tx,
        user_id: null,
        account: "house_balance",
        direction: data.amount >= 0 ? "debit" : "credit",
        amount: Math.abs(data.amount),
        ref_type: "admin_adjustment",
        memo: data.memo ?? "Admin adjustment",
      },
      {
        tx_id: tx,
        user_id: data.userId,
        account: "user_balance",
        direction: data.amount >= 0 ? "credit" : "debit",
        amount: Math.abs(data.amount),
        ref_type: "admin_adjustment",
        memo: data.memo ?? "Admin adjustment",
      },
    ]);

    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "balance_adjust",
      target_type: "profile",
      target_id: data.userId,
      details: { amount: data.amount, memo: data.memo ?? null },
    });

    return { balance: next };
  });

export const adminSetFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; banned?: boolean; muted?: boolean }) =>
    z
      .object({
        userId: z.string().uuid(),
        banned: z.boolean().optional(),
        muted: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const patch: { is_banned?: boolean; is_muted?: boolean } = {};
    if (data.banned !== undefined) patch.is_banned = data.banned;
    if (data.muted !== undefined) patch.is_muted = data.muted;
    if (Object.keys(patch).length === 0) return { ok: true };

    await db.from("profiles").update(patch).eq("id", data.userId);
    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "profile_flags",
      target_type: "profile",
      target_id: data.userId,
      details: patch,
    });
    return { ok: true };
  });

export const adminListChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    const { data } = await db
      .from("chat_messages")
      .select("id, user_id, username, body, is_deleted, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    return data ?? [];
  });

export const adminDeleteChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    await db.from("chat_messages").update({ is_deleted: true }).eq("id", data.id);
    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "chat_delete",
      target_type: "chat_message",
      target_id: data.id,
      details: {},
    });
    return { ok: true };
  });

/** Staff queue of pending Steam withdrawals. */
export const adminWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    const { data } = await db
      .from("withdrawals")
      .select(
        "id, value, status, steam_id, trade_url, trade_offer_id, note, created_at, item:items(name, image_url, rarity), profile:profiles(username)",
      )
      .order("created_at", { ascending: false })
      .limit(60);
    return data ?? [];
  });

/** Marks a withdrawal as sent, failed or cancelled. Failed/cancelled returns the skin to the player. */
export const resolveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; status: "sent" | "failed" | "cancelled"; offerId?: string; note?: string }) =>
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(["sent", "failed", "cancelled"]),
          offerId: z.string().trim().max(40).optional(),
          note: z.string().trim().max(200).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const { error } = await db.rpc("fn_resolve_withdrawal", {
      p_withdrawal: data.id,
      p_status: data.status,
      p_offer: data.offerId ?? "",
      p_note: data.note ?? "",
    });
    if (error) throw new Error("Could not update this withdrawal");
    await db.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: `withdrawal_${data.status}`,
      target_type: "withdrawal",
      target_id: data.id,
    });
    return { ok: true };
  });
