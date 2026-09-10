/**
 * Case cover artwork stored in the PRIVATE `case-covers` bucket.
 *
 * Staff upload a PNG through `uploadCaseCover`; the stored value is
 * `storage:<path>`. Anyone viewing the site resolves it to a short-lived
 * signed URL through `signCaseCover`, so the bucket never has to be public.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { loose } from "@/lib/supabase-loose";

export const COVER_PREFIX = "storage:";
const BUCKET = "case-covers";
const SIGNED_TTL = 60 * 60; // 1 hour

function isStoredCover(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(COVER_PREFIX);
}

/** `storage:cases/xyz.png` -> `cases/xyz.png` (plain URLs pass through as null). */
export function coverStoragePath(value: string | null | undefined) {
  return isStoredCover(value) ? value!.slice(COVER_PREFIX.length) : null;
}

const pathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)$/, "Bad cover path");

export const uploadCaseCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fileName: string; contentType: string; dataBase64: string }) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.string().trim().max(60),
        // ~6 MB of base64
        dataBase64: z.string().min(1).max(8_400_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await loose(supabaseAdmin)
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles || roles.length === 0) throw new Error("Staff only");

    if (!/^image\/(png|jpeg|webp)$/.test(data.contentType)) {
      throw new Error("Only PNG, JPG or WEBP images are allowed");
    }

    const ext = data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const path = `cases/${crypto.randomUUID()}.${ext}`;

    const binary = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message || "Could not upload this cover");

    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL);

    return { value: `${COVER_PREFIX}${path}`, url: signed?.signedUrl ?? null };
  });

/** Short-lived signed URL so a private cover can be displayed in the browser. */
export const signCaseCover = createServerFn({ method: "GET" })
  .inputValidator((d: { path: string }) => z.object({ path: pathSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(data.path, SIGNED_TTL);
    if (error) return { url: null };
    return { url: signed?.signedUrl ?? null };
  });
