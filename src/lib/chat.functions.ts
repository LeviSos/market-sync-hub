import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

export type ChatMessage = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
};

export const listChat = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db
    .from("chat_messages")
    .select("id, user_id, username, avatar_url, body, is_deleted, created_at")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).reverse() as ChatMessage[];
});

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string }) =>
    z.object({ body: z.string().trim().min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("username, avatar_url, is_muted, is_banned")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");
    if (profile.is_banned) throw new Error("Your account is banned");
    if (profile.is_muted) throw new Error("You are muted in chat");

    const { data: row, error } = await db
      .from("chat_messages")
      .insert({
        user_id: context.userId,
        username: profile.username ?? "Player",
        avatar_url: profile.avatar_url,
        body: data.body,
      })
      .select("id, user_id, username, avatar_url, body, is_deleted, created_at")
      .single();
    if (error) throw new Error("Could not send that message");
    return row as ChatMessage;
  });
