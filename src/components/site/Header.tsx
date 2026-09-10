import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ChevronsUp,
  Swords,
  Users,
  Package,
  FileText,
  ShieldCheck,
  Shield,
  User,
  LogOut,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe, signOut } from "@/hooks/useAuth";
import { SignInButtons } from "@/components/site/SignInButtons";
import { liveDrops } from "@/lib/public.functions";
import { useT } from "@/lib/i18n";
import { Price } from "@/components/site/Coin";
import { TopUpButton } from "@/components/site/TopUpButton";

const navLink =
  "flex items-center gap-1.5 rounded-md px-3 py-2 font-display text-[13px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-surface hover:text-foreground";
const navLinkActive =
  "flex items-center gap-1.5 rounded-md bg-surface px-3 py-2 font-display text-[13px] font-semibold uppercase tracking-wide text-primary";
const mobileLink =
  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-wide text-muted-foreground";
const mobileLinkActive =
  "flex shrink-0 items-center gap-1.5 rounded-md bg-surface px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-wide text-primary";

export function Header() {
  const { data, signedIn, isAdmin, session } = useMe();
  const authenticated = signedIn && Boolean(session);
  const t = useT();
  const qc = useQueryClient();
  const profile = data?.profile;
  const email = session?.user?.email ?? null;
  // Never show placeholders like "?" or "…": fall back to the email name, then
  // to a short account id.
  const displayName =
    (profile?.username && String(profile.username).trim()) ||
    (email ? email.split("@")[0]! : "") ||
    (profile?.id ? `ID ${String(profile.id).slice(0, 6)}` : t("header.player"));
  const initial = displayName.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "P";

  const { data: drops } = useQuery({
    queryKey: ["live-drops"],
    queryFn: () => liveDrops(),
    staleTime: 5_000,
  });

  // Live-ish player counter: a stable base that drifts every few seconds.
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const base = 820 + (drops?.length ?? 0) * 7;
    setOnline(base + Math.floor(Math.random() * 60));
    const id = window.setInterval(() => setOnline(base + Math.floor(Math.random() * 60)), 6000);
    return () => window.clearInterval(id);
  }, [drops?.length]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur lg:h-[60px]">
      <div className="flex h-[60px] items-center gap-4 px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <ChevronsUp className="size-5" strokeWidth={3} />
          </span>
          <span className="font-display text-xl font-bold tracking-wide">CASEFORGE</span>
        </Link>

        <div className="hidden items-center gap-1.5 border-l border-border pl-4 text-[11px] uppercase tracking-wide text-muted-foreground xl:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <Users className="size-4 text-primary" />
          <span>{t("header.online")}</span>
          <span className="font-display text-sm font-bold text-foreground">{online}</span>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          <Link
            to="/"
            className={navLink}
            activeProps={{ className: navLinkActive }}
            activeOptions={{ exact: true }}
          >
            <Package className="size-4" /> {t("nav.cases")}
          </Link>
          <Link to="/upgrade" className={navLink} activeProps={{ className: navLinkActive }}>
            <ChevronsUp className="size-4" /> {t("nav.upgrade")}
          </Link>
          <Link to="/contracts" className={navLink} activeProps={{ className: navLinkActive }}>
            <FileText className="size-4" /> {t("nav.contracts")}
          </Link>
          <Link to="/battles" className={navLink} activeProps={{ className: navLinkActive }}>
            <Swords className="size-4" /> {t("nav.battles")}
            <span className="ml-1 rounded-[4px] border border-primary/50 bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wider text-primary">
              {t("nav.soon")}
            </span>
          </Link>
          <Link to="/fair" className={navLink} activeProps={{ className: navLinkActive }}>
            <ShieldCheck className="size-4" /> {t("nav.fair")}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {authenticated ? (
            <>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="rounded-md border border-border bg-surface px-3 py-1.5 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("header.balance")}
                  </p>
                  <p className="font-display text-sm font-bold text-primary">
                    {<Price value={profile?.balance} />}
                  </p>
                </div>
                <TopUpButton />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-surface">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="size-9 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid size-9 place-items-center rounded-full border border-primary/40 bg-primary/15 font-display text-sm font-bold text-primary"
                    >
                      {initial}
                    </span>
                  )}
                  <span className="hidden max-w-[140px] truncate font-display text-sm font-semibold sm:block">
                    {displayName}
                  </span>
                  <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface text-xs font-bold text-primary">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="size-8 object-cover" />
                      ) : (
                        initial
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold">{displayName}</p>
                      {email && (
                        <p className="truncate text-[11px] text-muted-foreground">{email}</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />

                  <div className="px-2 py-1.5 sm:hidden">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t("header.balance")}
                    </p>
                    <p className="font-display text-sm font-bold text-primary">
                      <Price value={profile?.balance} />
                    </p>
                  </div>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem asChild>
                    <Link
                      to="/profile"
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm"
                    >
                      <User className="size-4 text-muted-foreground" /> {t("header.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      to="/inventory"
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm"
                    >
                      <Package className="size-4 text-muted-foreground" /> {t("nav.inventory")}
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link
                        to="/admin"
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm"
                      >
                        <Shield className="size-4 text-muted-foreground" /> {t("header.admin")}
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void signOut(qc)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4" /> {t("header.signOut")}

                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <SignInButtons />
          )}
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto rail-scroll border-t border-border bg-background/95 px-2 py-1.5 lg:hidden">
        <Link
          to="/"
          className={mobileLink}
          activeProps={{ className: mobileLinkActive }}
          activeOptions={{ exact: true }}
        >
          <Package className="size-4" /> {t("nav.cases")}
        </Link>
        <Link to="/upgrade" className={mobileLink} activeProps={{ className: mobileLinkActive }}>
          <ChevronsUp className="size-4" /> {t("nav.upgrade")}
        </Link>
        <Link to="/contracts" className={mobileLink} activeProps={{ className: mobileLinkActive }}>
          <FileText className="size-4" /> {t("nav.contracts")}
        </Link>
        <Link to="/battles" className={mobileLink} activeProps={{ className: mobileLinkActive }}>
          <Swords className="size-4" /> {t("nav.battles")}
          <span className="ml-1 rounded-[4px] border border-primary/50 bg-primary/15 px-1 py-0.5 text-[8px] font-bold leading-none tracking-wider text-primary">
            {t("nav.soon")}
          </span>
        </Link>
        {authenticated && (
          <Link
            to="/inventory"
            className={mobileLink}
            activeProps={{ className: mobileLinkActive }}
          >
            <Package className="size-4" /> {t("nav.items")}
          </Link>
        )}
        <Link to="/fair" className={mobileLink} activeProps={{ className: mobileLinkActive }}>
          <ShieldCheck className="size-4" /> {t("nav.fair")}
        </Link>
      </nav>
    </header>
  );
}
