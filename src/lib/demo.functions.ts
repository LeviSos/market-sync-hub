import { loose } from "@/lib/supabase-loose";
import { createServerFn } from "@tanstack/react-start";

/** Temporary test sign-in so the site is playable while Steam login is off. */
export const guestLogin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin = loose(rawAdmin);
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `guest_${tag}@demo.local`;

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { username: `Guest ${tag.toUpperCase()}` },
  });
  if (error || !created.user) throw new Error("Could not create a test account");

  await supabaseAdmin.from("profiles").update({ balance: 1000 }).eq("id", created.user.id);

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) throw new Error("Could not start your session");

  return { tokenHash: link.properties.hashed_token };
});
