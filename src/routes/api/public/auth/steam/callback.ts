import { loose } from "@/lib/supabase-loose";
import { createFileRoute } from "@tanstack/react-router";

function fail(origin: string, reason: string) {
  return new Response(null, {
    status: 302,
    headers: { location: `${origin}/auth/complete?error=${encodeURIComponent(reason)}` },
  });
}

type SteamProfile = { name: string | undefined; avatar: string | undefined };

/** Official Steam Web API — reliable, also works for private profiles. */
async function fetchViaWebApi(steamId: string): Promise<SteamProfile> {
  const key = process.env["STEAM_WEB_API_KEY"];
  if (!key) return { name: undefined, avatar: undefined };
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`,
    );
    if (!res.ok) return { name: undefined, avatar: undefined };
    const json = (await res.json()) as {
      response?: { players?: Array<{ personaname?: string; avatarfull?: string }> };
    };
    const player = json.response?.players?.[0];
    return { name: player?.personaname?.slice(0, 40), avatar: player?.avatarfull };
  } catch {
    return { name: undefined, avatar: undefined };
  }
}

/** Fallback: public profile XML. */
async function fetchViaXml(steamId: string): Promise<SteamProfile> {
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const xml = await res.text();
    const name = /<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/.exec(xml)?.[1];
    const avatar = /<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/.exec(xml)?.[1];
    return { name: name?.slice(0, 40), avatar };
  } catch {
    return { name: undefined, avatar: undefined };
  }
}

async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const api = await fetchViaWebApi(steamId);
  if (api.name && api.avatar) return api;
  const xml = await fetchViaXml(steamId);
  return { name: api.name ?? xml.name, avatar: api.avatar ?? xml.avatar };
}

type SessionTokenResult =
  | { tokenHash: string; error?: never }
  | { tokenHash?: never; error: string };

/** Creates (or refreshes) the Supabase account for this Steam id and returns a one-time login token. */
async function createSupabaseSession(
  steamId: string,
  profileInfo: { name: string | undefined; avatar: string | undefined },
): Promise<SessionTokenResult> {
  try {
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = loose(rawAdmin);
    const fallbackEmail = `steam_${steamId}@steam.local`;

    const { data: existing, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("steam_id", steamId)
      .maybeSingle();
    if (profileError) return { error: "Could not read the Steam profile" };

    let loginEmail = fallbackEmail;

    if (!existing) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: fallbackEmail,
        email_confirm: true,
        user_metadata: {
          steam_id: steamId,
          username: profileInfo.name ?? `Player ${steamId.slice(-4)}`,
          avatar_url: profileInfo.avatar ?? null,
        },
      });
      if (error && !/already/i.test(error.message)) {
        console.error("[Steam auth] createUser failed", error.message);
        return { error: "Could not create the Steam account" };
      }
      loginEmail = created.user?.email ?? fallbackEmail;
    } else {
      // A copied project can retain the profile row while auth.users is empty.
      // Re-create the auth identity with the profile id so FK ownership remains
      // intact and the generated magic link can produce a real JWT.
      const { data: authUser, error: authUserError } =
        await supabaseAdmin.auth.admin.getUserById(existing.id);
      if (authUserError || !authUser.user) {
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
          id: existing.id,
          email: fallbackEmail,
          email_confirm: true,
          user_metadata: {
            steam_id: steamId,
            username: profileInfo.name ?? `Player ${steamId.slice(-4)}`,
            avatar_url: profileInfo.avatar ?? null,
          },
        });
        if (createError) {
          console.error("[Steam auth] identity recovery failed", createError.message);
          return { error: "Could not recover the Steam account" };
        }
      } else {
        // Imported projects may retain an older synthetic email convention.
        // A magic link must target the actual Auth identity, not a newly computed address.
        loginEmail = authUser.user.email ?? fallbackEmail;
      }

      const patch: { username?: string; avatar_url?: string } = {};
      if (profileInfo.name) patch.username = profileInfo.name;
      if (profileInfo.avatar) patch.avatar_url = profileInfo.avatar;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("profiles").update(patch).eq("id", existing.id);
      }
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: loginEmail,
    });
    if (linkError) {
      console.error("[Steam auth] generateLink failed", linkError.message);
      return { error: "Could not generate a secure sign-in link" };
    }
    const tokenHash = link?.properties?.hashed_token;
    if (!tokenHash) return { error: "The sign-in service returned an empty token" };
    return { tokenHash };
  } catch (error) {
    console.error("[Steam auth] unexpected callback failure", error);
    return { error: "Sign-in service is temporarily unavailable" };
  }
}

export const Route = createFileRoute("/api/public/auth/steam/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;

        // 1. Ask Steam to confirm the assertion is genuine.
        const verify = new URLSearchParams();
        url.searchParams.forEach((v, k) => verify.set(k, v));
        verify.set("openid.mode", "check_authentication");

        const steamRes = await fetch("https://steamcommunity.com/openid/login", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: verify.toString(),
        });
        const body = await steamRes.text();
        if (!/is_valid\s*:\s*true/.test(body))
          return fail(origin, "Steam could not verify this sign-in");

        // 2. SteamID64 comes from the claimed identifier.
        const claimed = url.searchParams.get("openid.claimed_id") ?? "";
        const steamId = /\/id\/(\d{17})$/.exec(claimed)?.[1] ?? /\/(\d{17})$/.exec(claimed)?.[1];
        if (!steamId) return fail(origin, "Steam did not return an account id");

        const profileInfo = await fetchSteamProfile(steamId);
        const sessionResult = await createSupabaseSession(steamId, profileInfo);
        if (!sessionResult.tokenHash) {
          return fail(origin, sessionResult.error ?? "Could not create a secure sign-in session");
        }

        // 3. Hand the verified Steam identity and one-time session token to the client.
        const next = new URLSearchParams({ steam_id: steamId });
        if (profileInfo.name) next.set("steam_name", profileInfo.name);
        if (profileInfo.avatar) next.set("steam_avatar", profileInfo.avatar);
        next.set("token_hash", sessionResult.tokenHash);

        return new Response(null, {
          status: 302,
          headers: { location: `${origin}/auth/complete?${next.toString()}` },
        });
      },
    },
  },
});
