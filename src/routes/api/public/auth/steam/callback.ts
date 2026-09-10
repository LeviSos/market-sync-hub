import { createFileRoute } from "@tanstack/react-router";

function fail(origin: string, reason: string) {
  return new Response(null, {
    status: 302,
    headers: { location: `${origin}/auth/complete?error=${encodeURIComponent(reason)}` },
  });
}

type SteamProfile = { name: string | undefined; avatar: string | undefined };

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Official Steam Web API — reliable, also works for private profiles. */
async function fetchViaWebApi(steamId: string): Promise<SteamProfile> {
  const key = process.env["STEAM_WEB_API_KEY"] ?? process.env["STEAM_API_KEY"];
  if (!key) return { name: undefined, avatar: undefined };
  try {
    const res = await fetchWithTimeout(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`,
    );
    if (!res.ok) {
      console.warn("[Steam auth] GetPlayerSummaries returned", res.status);
      return { name: undefined, avatar: undefined };
    }
    const json = (await res.json()) as {
      response?: { players?: Array<{ personaname?: string; avatarfull?: string }> };
    };
    const player = json.response?.players?.[0];
    return { name: player?.personaname?.slice(0, 40), avatar: player?.avatarfull };
  } catch (error) {
    console.warn("[Steam auth] GetPlayerSummaries failed", error);
    return { name: undefined, avatar: undefined };
  }
}

/** Fallback: public profile XML. */
async function fetchViaXml(steamId: string): Promise<SteamProfile> {
  try {
    const res = await fetchWithTimeout(`https://steamcommunity.com/profiles/${steamId}?xml=1`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { name: undefined, avatar: undefined };
    const xml = await res.text();
    const name = /<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/.exec(xml)?.[1];
    const avatar = /<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/.exec(xml)?.[1];
    return { name: name?.slice(0, 40), avatar };
  } catch (error) {
    console.warn("[Steam auth] profile XML failed", error);
    return { name: undefined, avatar: undefined };
  }
}

/**
 * Profile lookup is decorative: a Steam outage or a private profile must never
 * block the sign-in, the account still gets a generated display name.
 */
async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const api = await fetchViaWebApi(steamId);
  if (api.name && api.avatar) return api;
  const xml = await fetchViaXml(steamId);
  return { name: api.name ?? xml.name, avatar: api.avatar ?? xml.avatar };
}

type SessionTokenResult =
  { tokenHash: string; error?: never } | { tokenHash?: never; error: string };

/** Creates (or refreshes) the Supabase account for this Steam id and returns a one-time login token. */
async function createSupabaseSession(
  steamId: string,
  profileInfo: SteamProfile,
): Promise<SessionTokenResult> {
  const displayName = profileInfo.name ?? `Player ${steamId.slice(-4)}`;
  const fallbackEmail = `steam_${steamId}@steam.local`;
  const metadata = {
    steam_id: steamId,
    username: displayName,
    avatar_url: profileInfo.avatar ?? null,
  };

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    console.error("[Steam auth] backend not configured", error);
    return { error: "The sign-in backend is not configured yet. Please try again later." };
  }

  try {
    // The profile row is a hint, not a requirement: a read failure (RLS,
    // renamed column, fresh copy of the project) must not abort the sign-in.
    let profileId: string | null = null;
    const { data: existing, error: profileError } = await db
      .from("profiles")
      .select("id")
      .eq("steam_id", steamId)
      .maybeSingle();
    if (profileError) {
      console.warn("[Steam auth] profile lookup failed, continuing", profileError.message);
    } else {
      profileId = (existing as { id?: string } | null)?.id ?? null;
    }

    let loginEmail = fallbackEmail;
    let userId = profileId;

    if (profileId) {
      const { data: authUser } = await db.auth.admin.getUserById(profileId);
      if (authUser?.user) loginEmail = authUser.user.email ?? fallbackEmail;
      else userId = null;
    }

    const ensureUser = async () => {
      const payload: Record<string, unknown> = {
        email: fallbackEmail,
        email_confirm: true,
        user_metadata: metadata,
      };
      // Keep the original id so existing rows stay owned by the same account.
      if (profileId) payload["id"] = profileId;
      const { data: created, error } = await db.auth.admin.createUser(
        payload as Parameters<typeof db.auth.admin.createUser>[0],
      );
      if (error && !/already|registered|exists|duplicate/i.test(error.message)) {
        throw new Error(error.message);
      }
      if (created?.user) {
        userId = created.user.id;
        loginEmail = created.user.email ?? fallbackEmail;
      }
    };

    if (!userId) await ensureUser();

    // One-time login token → the client exchanges it for access/refresh tokens.
    const generate = async () =>
      db.auth.admin.generateLink({ type: "magiclink", email: loginEmail });

    let { data: link, error: linkError } = await generate();
    if (linkError) {
      // The Auth identity is gone or uses a different address: recreate it once.
      console.warn("[Steam auth] generateLink retry", linkError.message);
      await ensureUser();
      loginEmail = fallbackEmail;
      ({ data: link, error: linkError } = await generate());
    }
    if (linkError) {
      console.error("[Steam auth] generateLink failed", linkError.message);
      return { error: `Could not generate a secure sign-in link: ${linkError.message}` };
    }

    const tokenHash = link?.properties?.hashed_token;
    if (!tokenHash) return { error: "The sign-in service returned an empty token" };

    const resolvedId = link?.user?.id ?? userId;
    if (resolvedId) {
      // Best-effort profile refresh; a failure here never blocks the sign-in.
      const patch: Record<string, unknown> = { id: resolvedId, steam_id: steamId };
      if (profileInfo.name) patch["username"] = profileInfo.name;
      if (profileInfo.avatar) patch["avatar_url"] = profileInfo.avatar;
      const { error: upsertError } = await db.from("profiles").upsert(patch, { onConflict: "id" });
      if (upsertError) console.warn("[Steam auth] profile upsert skipped", upsertError.message);
    }

    return { tokenHash };
  } catch (error) {
    console.error("[Steam auth] unexpected callback failure", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return { error: `Sign-in service error: ${detail}` };
  }
}

async function getDb() {
  const { getAdminClient } = await import("@/lib/supabase-admin.server");
  return getAdminClient();
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

        let body = "";
        try {
          const steamRes = await fetchWithTimeout("https://steamcommunity.com/openid/login", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: verify.toString(),
          });
          body = await steamRes.text();
        } catch (error) {
          console.error("[Steam auth] OpenID verification unreachable", error);
          return fail(origin, "Steam did not respond. Please try signing in again.");
        }
        if (!/is_valid\s*:\s*true/.test(body))
          return fail(origin, "Steam could not verify this sign-in");

        // 2. SteamID64 comes from the claimed identifier.
        const claimed =
          url.searchParams.get("openid.claimed_id") ??
          url.searchParams.get("openid.identity") ??
          "";
        const steamId = /(\d{17})\/?$/.exec(claimed)?.[1];
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
