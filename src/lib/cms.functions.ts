/**
 * Admin CMS server functions: items, cases, drop rates, players, roles,
 * sanctions, history and global site settings.
 *
 * Every function is staff-only (a row in user_roles) and writes an audit entry
 * for anything that changes data.
 */
import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaffRoles } from "@/lib/staff-guard";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

async function requireStaff(userId: string) {
  const db = await admin();
  const { roles, isAdmin } = await requireStaffRoles(db, userId);
  return { db, roles, isAdmin };
}

type Db = Awaited<ReturnType<typeof admin>>;

async function audit(
  db: Db,
  actor: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  await db.from("admin_audit_log").insert({
    actor_id: actor,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

/* ------------------------------- items ---------------------------------- */

export const cmsItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { search?: string }) =>
    z.object({ search: z.string().max(60).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    let q = db
      .from("items")
      .select("id, slug, name, image_url, rarity, weapon, base_price, price_override, is_active")
      .order("base_price", { ascending: false })
      .limit(200);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

const itemInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  rarity: z.string().trim().min(1).max(30),
  weapon: z.string().trim().max(60).nullable().optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
  base_price: z.number().min(0).max(1000000),
  price_override: z.number().min(0).max(1000000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const cmsSaveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    const patch = {
      name: data.name,
      rarity: data.rarity,
      weapon: data.weapon ?? null,
      image_url: data.image_url ?? null,
      base_price: data.base_price,
      price_override: data.price_override ?? null,
      is_active: data.is_active ?? true,
    };

    if (data.id) {
      const { error } = await db.from("items").update(patch).eq("id", data.id);
      if (error) throw new Error("Could not save this skin");
      await audit(db, context.userId, "item_update", "item", data.id, patch);
      return { id: data.id };
    }
    const { data: created, error } = await db
      .from("items")
      .insert({ ...patch, slug: slug || crypto.randomUUID().slice(0, 8) })
      .select("id")
      .single();
    if (error) throw new Error("Could not create this skin");
    await audit(db, context.userId, "item_create", "item", created.id, patch);
    return { id: created.id as string };
  });

export const cmsToggleItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    await db.from("items").update({ is_active: data.active }).eq("id", data.id);
    await audit(db, context.userId, "item_toggle", "item", data.id, { active: data.active });
    return { ok: true };
  });

/* -------------------------------- cases --------------------------------- */

export const cmsCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    const { data } = await db
      .from("cases")
      .select("id, slug, name, category, price, tag, image_url, is_active")
      .order("price", { ascending: true })
      .limit(100);
    return data ?? [];
  });

export const cmsSaveCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(80),
        category: z.string().trim().max(40).nullable().optional(),
        tag: z.string().trim().max(30).nullable().optional(),
        image_url: z.string().trim().max(500).nullable().optional(),
        price: z.number().min(0).max(1000000),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const patch = {
      name: data.name,
      category: data.category ?? null,
      tag: data.tag ?? null,
      image_url: data.image_url ?? null,
      price: data.price,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await db.from("cases").update(patch).eq("id", data.id);
      if (error) throw new Error("Could not save this case");
      await audit(db, context.userId, "case_update", "case", data.id, patch);
      return { id: data.id };
    }
    const slug =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || crypto.randomUUID().slice(0, 8);
    const { data: created, error } = await db
      .from("cases")
      .insert({ ...patch, slug })
      .select("id")
      .single();
    if (error) throw new Error("Could not create this case");
    await audit(db, context.userId, "case_create", "case", created.id, patch);
    return { id: created.id as string };
  });

/** Drop pool of one case with the resulting chance per item. */
export const cmsCasePool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const { data: rows } = await db
      .from("case_items")
      .select("id, weight, item:items(id, name, image_url, rarity, base_price, price_override)")
      .eq("case_id", data.caseId);
    const list = rows ?? [];
    const total = list.reduce((s, r) => s + Number(r.weight ?? 0), 0) || 1;
    return list.map((r) => ({ ...r, chance: Number(r.weight ?? 0) / total }));
  });

export const cmsSetPoolItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; itemId: string; weight: number }) =>
    z
      .object({
        caseId: z.string().uuid(),
        itemId: z.string().uuid(),
        weight: z.number().min(0).max(1000000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const { data: existing } = await db
      .from("case_items")
      .select("id")
      .eq("case_id", data.caseId)
      .eq("item_id", data.itemId)
      .maybeSingle();
    if (existing) {
      await db.from("case_items").update({ weight: data.weight }).eq("id", existing.id);
    } else {
      const { error } = await db
        .from("case_items")
        .insert({ case_id: data.caseId, item_id: data.itemId, weight: data.weight });
      if (error) throw new Error("Could not add this skin to the case");
    }
    await audit(db, context.userId, "case_pool_set", "case", data.caseId, {
      item_id: data.itemId,
      weight: data.weight,
    });
    return { ok: true };
  });

export const cmsRemovePoolItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    await db.from("case_items").delete().eq("id", data.id);
    await audit(db, context.userId, "case_pool_remove", "case_item", data.id);
    return { ok: true };
  });

/* ------------------------------- players -------------------------------- */

export const cmsRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    const { data } = await db.from("user_roles").select("user_id, role").limit(500);
    return data ?? [];
  });

export const cmsSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "moderator" | "user" }) =>
    z
      .object({ userId: z.string().uuid(), role: z.enum(["admin", "moderator", "user"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await requireStaff(context.userId);
    if (!isAdmin) throw new Error("Admins only");
    await db.from("user_roles").delete().eq("user_id", data.userId);
    if (data.role !== "user") {
      const { error } = await db
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error("Could not change this role");
    }
    await audit(db, context.userId, "role_set", "profile", data.userId, { role: data.role });
    return { ok: true };
  });

/** Mute or ban with a reason and an optional duration in minutes. */
export const cmsSanction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      userId: string;
      kind: "mute" | "ban";
      active: boolean;
      reason?: string;
      minutes?: number;
    }) =>
      z
        .object({
          userId: z.string().uuid(),
          kind: z.enum(["mute", "ban"]),
          active: z.boolean(),
          reason: z.string().trim().max(200).optional(),
          minutes: z.number().min(0).max(60 * 24 * 365).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    const patch =
      data.kind === "ban" ? { is_banned: data.active } : { is_muted: data.active };
    const { error } = await db.from("profiles").update(patch).eq("id", data.userId);
    if (error) throw new Error("Could not update this player");
    const until =
      data.active && data.minutes
        ? new Date(Date.now() + data.minutes * 60_000).toISOString()
        : null;
    await audit(db, context.userId, `${data.kind}_${data.active ? "on" : "off"}`, "profile", data.userId, {
      reason: data.reason ?? null,
      until,
    });
    return { ok: true, until };
  });

/* ------------------------------- history -------------------------------- */

export const cmsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { kind?: "cases" | "upgrades" | "contracts" }) =>
    z.object({ kind: z.enum(["cases", "upgrades", "contracts"]).default("cases") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    if (data.kind === "upgrades") {
      const { data: rows } = await db
        .from("upgrades")
        .select(
          "id, stake, chance, won, target_value, created_at, profile:profiles(username), target:items(name)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      return rows ?? [];
    }
    if (data.kind === "contracts") {
      const { data: rows } = await db
        .from("contracts")
        .select(
          "id, input_count, input_value, output_value, created_at, profile:profiles(username), item:items(name)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      return rows ?? [];
    }
    const { data: rows } = await db
      .from("case_openings")
      .select("id, value, created_at, profile:profiles(username), item:items(name)")
      .order("created_at", { ascending: false })
      .limit(60);
    return rows ?? [];
  });

/* ------------------------------- settings -------------------------------- */

export type SiteSettings = {
  rtp: number;
  upgradeHouse: number;
  casesEnabled: boolean;
  upgradeEnabled: boolean;
  contractsEnabled: boolean;
  battlesEnabled: boolean;
  announcement: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  rtp: 92,
  upgradeHouse: 92,
  casesEnabled: true,
  upgradeEnabled: true,
  contractsEnabled: true,
  battlesEnabled: false,
  announcement: "",
};

/** Settings live in admin_audit_log so no schema change is needed. */
export const cmsGetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    const { data } = await db
      .from("admin_audit_log")
      .select("details")
      .eq("action", "site_settings")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const saved = (data?.details ?? {}) as Partial<SiteSettings>;
    return { ...DEFAULT_SETTINGS, ...saved } as SiteSettings;
  });

export const cmsSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rtp: z.number().min(50).max(100),
        upgradeHouse: z.number().min(50).max(100),
        casesEnabled: z.boolean(),
        upgradeEnabled: z.boolean(),
        contractsEnabled: z.boolean(),
        battlesEnabled: z.boolean(),
        announcement: z.string().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireStaff(context.userId);
    await audit(db, context.userId, "site_settings", "site", null, data);
    return data as SiteSettings;
  });
