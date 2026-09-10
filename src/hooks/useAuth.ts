import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { loose } from "@/lib/supabase-loose";

const supabase = loose(typedSupabase);
import { getMe } from "@/lib/game.functions";
import { clearSteamUser, useSteamUser } from "@/lib/steam-auth";
import { useBalanceOverrides } from "@/lib/admin-balances";
import { isOwnerId } from "@/lib/owner";

/**
 * Staff access is bound to unique account ids, never to a display name:
 * anyone can rename themselves "levasikov", but nobody else owns these ids.
 * Server functions still enforce their own roles on every write.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let authEventSeen = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (disposed) return;
      authEventSeen = true;
      setSession(s);
      setReady(true);
      qc.invalidateQueries({ queryKey: ["me"] });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (disposed || authEventSeen) return;
      setSession(data.session);
      setReady(true);
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  return { session, ready };
}

export function useMe() {
  const { session, ready } = useSession();
  const steam = useSteamUser();
  const overrides = useBalanceOverrides();
  const query = useQuery({
    queryKey: ["me", session?.user.id ?? null],
    queryFn: () => getMe(),
    enabled: Boolean(session),
    staleTime: 10_000,
  });

  // A Steam sign-in is enough to show the account in the header, even while
  // (or if) the Supabase session isn't available.
  const base = query.data
    ? {
        ...query.data,
        profile: query.data.profile
          ? {
              ...query.data.profile,
              username: query.data.profile.username ?? steam?.username ?? null,
              avatar_url: query.data.profile.avatar_url ?? steam?.avatarUrl ?? null,
            }
          : query.data.profile,
      }
    : steam
      ? {
          profile: {
            id: steam.steamId,
            username: steam.username,
            avatar_url: steam.avatarUrl,
            balance: steam.balance,
          },
        }
      : query.data;

  // A balance set from the staff panel wins until the backend catches up.
  const profileId = base?.profile?.id as string | undefined;
  const override = profileId ? overrides[profileId] : undefined;
  const data =
    base?.profile && typeof override === "number"
      ? { ...base, profile: { ...base.profile, balance: override } }
      : base;

  const signedIn = Boolean(session) || Boolean(steam);
  const admin =
    signedIn &&
    isOwnerId({
      userId: session?.user?.id ?? null,
      profileId: (data?.profile?.id as string | undefined) ?? null,
      steamId: steam?.steamId ?? (data?.profile as { steam_id?: string } | undefined)?.steam_id ?? null,
    });
  // No Supabase JWT: every protected server function would answer 401, so the
  // whole game runs locally instead.
  const localMode = signedIn && !session;

  return {
    ...query,
    data: data as typeof query.data,
    session,
    ready,
    signedIn,
    localMode,
    steamUser: steam,
    isAdmin: admin,
    role: admin ? ("admin" as const) : ("player" as const),
  };
}

export async function signOut(qc: ReturnType<typeof useQueryClient>) {
  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut();
  clearSteamUser();
  window.location.href = "/";
}
