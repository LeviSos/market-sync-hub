import { useState } from "react";
import { toast } from "sonner";
import { guestLogin } from "@/lib/demo.functions";

export function SignInButtons({ size = "sm" }: { size?: "sm" | "lg" }) {
  const [busy, setBusy] = useState(false);

  const pad = size === "lg" ? "px-8 py-3 text-sm" : "px-4 py-2 text-sm";

  async function playNow() {
    setBusy(true);
    try {
      const { tokenHash } = await guestLogin();
      window.location.href = `/auth/complete?token_hash=${encodeURIComponent(tokenHash)}`;
    } catch (err) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("SERVICE_ROLE")
          ? "Test accounts are not set up yet"
          : "Could not start a test account",
      );
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/api/public/auth/steam/login"
        className={`inline-flex items-center gap-2 rounded-md border font-display font-bold uppercase tracking-wide transition-colors hover:bg-surface-2 ${pad}`}
      >
        Login via Steam
      </a>
      <button
        onClick={() => void playNow()}
        disabled={busy}
        className={`hidden items-center gap-2 rounded-md border border-border font-display text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 ${pad}`}
      >
        {busy ? "Starting…" : "Test account"}
      </button>
    </div>
  );
}
