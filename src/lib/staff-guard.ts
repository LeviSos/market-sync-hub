/**
 * Shared staff resolution for the CMS server functions.
 *
 * A caller is staff when they have a row in user_roles. The owner account
 * (matched by account id or Steam id — never by nickname) is granted the
 * `admin` role automatically the first time it opens the panel.
 */
import { isOwnerId } from "@/lib/owner";

/** Loose Supabase client (admin) passed in by the caller. */
type AnyDb = {
  from: (table: string) => any;
};

export async function resolveStaff(db: AnyDb, userId: string) {
  const read = async () => {
    const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
    return (data ?? []).map((r: { role: string }) => String(r.role));
  };

  let roles: string[] = await read();

  if (roles.length === 0) {
    const { data: profile } = await db
      .from("profiles")
      .select("id, steam_id")
      .eq("id", userId)
      .maybeSingle();

    if (isOwnerId({ userId, profileId: profile?.id ?? null, steamId: profile?.steam_id ?? null })) {
      await db.from("user_roles").upsert(
        { user_id: userId, role: "admin" },
        { onConflict: "user_id,role" },
      );
      roles = await read();
      if (roles.length === 0) roles = ["admin"];
    }
  }

  return { roles, isStaff: roles.length > 0, isAdmin: roles.includes("admin") || roles.includes("owner") };
}

export async function requireStaffRoles(db: AnyDb, userId: string) {
  const result = await resolveStaff(db, userId);
  if (!result.isStaff) throw new Error("Staff only");
  return result;
}
