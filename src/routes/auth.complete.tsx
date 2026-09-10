import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { loose } from "@/lib/supabase-loose";

const supabase = loose(typedSupabase);
import { SignInButtons } from "@/components/site/SignInButtons";
import { saveSteamUser } from "@/lib/steam-auth";

export const Route = createFileRoute("/auth/complete")({
  head: () => ({
    meta: [
      { title: "Signing you in — CaseForge" },
      { name: "description", content: "Finishing your Steam sign-in on CaseForge." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Signing you in — CaseForge" },
      { property: "og:description", content: "Finishing your Steam sign-in on CaseForge." },
    ],
  }),
  component: AuthComplete,
});

function AuthComplete() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(err);
      return;
    }

    const steamId = params.get("steam_id");
    const tokenHash = params.get("token_hash");
    if (!tokenHash) {
      setError("Missing sign-in token");
      return;
    }
    supabase.auth
      .verifyOtp({ type: "magiclink", token_hash: tokenHash })
      .then(({ data, error: e }) => {
        if (e || !data.session) {
          setError(e?.message ?? "Sign-in did not create a session");
          return;
        }
        if (steamId) {
          saveSteamUser({
            steamId,
            username: params.get("steam_name"),
            avatarUrl: params.get("steam_avatar"),
          });
        }
        navigate({ to: "/", replace: true });
      })
      .catch(() => {
        setError("Sign-in failed");
      });
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="panel max-w-md p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Sign-in didn't finish</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-6 flex justify-center">
              <SignInButtons size="lg" />
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto size-10 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}
