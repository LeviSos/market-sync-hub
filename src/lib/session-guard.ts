import { getAccessToken } from "@/integrations/supabase/auth-attacher";
import { supabase } from "@/integrations/supabase/client";

/** Thrown when a protected call is attempted without a valid session. */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAuthError(error: unknown) {
  if (error instanceof SessionExpiredError) return true;
  const value = error as { message?: string; status?: number; statusCode?: number } | null;
  return (
    value?.status === 401 ||
    value?.statusCode === 401 ||
    /unauthor|jwt|session|401/i.test(value?.message ?? "")
  );
}

async function waitForInitialSession() {
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
      resolve(token);
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish(session.access_token);
    });
    const timer = setTimeout(() => finish(null), 1_500);
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) finish(data.session.access_token);
    });
  });
}

/**
 * Resolve a valid access token.
 *
 * The Supabase client restores the persisted session asynchronously, so right
 * after mount `getSession()` can legitimately answer `null` while the header
 * already shows an authenticated profile. Instead of failing immediately we
 * wait briefly for the client to initialise and try a silent
 * `refreshSession()` before declaring the session expired.
 */
export async function requireSession(message: string): Promise<string> {
  const initial = await waitForInitialSession();
  if (initial) return initial;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    if (token) return token;

    // Silent background refresh from the persisted refresh token.
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) return data.session.access_token;
    } catch {
      /* keep retrying */
    }

    if (attempt < 3) await sleep(250 * (attempt + 1));
  }
  throw new SessionExpiredError(message);
}

/** Retry one protected request after silently refreshing an outdated JWT. */
export async function withFreshSession<T>(message: string, request: () => Promise<T>): Promise<T> {
  await requireSession(message);
  try {
    return await request();
  } catch (error) {
    if (!isAuthError(error)) throw error;
    await supabase.auth.refreshSession();
    await requireSession(message);
    return request();
  }
}
