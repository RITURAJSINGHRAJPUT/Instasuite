"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Building2,
  Inbox,
  Bot,
  Settings,
  ShieldCheck,
  Users,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import type { Feature } from "@/lib/permissions";
import { useMe } from "@/lib/useMe";
import { sharedGet } from "@/lib/shared-fetch";
import Logo from "./Logo";

type Usage = {
  totals: { messages: number };
  subscription: { plans: { name: string; max_messages_per_month: number | null } | null } | null;
};

// Every destination, tagged with the capability that unlocks it. The list is
// filtered by the current user's capabilities (from /api/me), so each role sees
// only its own sections. Users (super_admin) and Admin (admin+) are back in the
// list — they were hard-hidden in solo mode; capability filtering replaces that.
const NAV: { href: string; label: string; icon: typeof LayoutGrid; feature: Feature }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, feature: "overview" },
  { href: "/businesses", label: "Businesses", icon: Building2, feature: "businesses" },
  { href: "/inbox", label: "Inbox", icon: Inbox, feature: "inbox" },
  { href: "/scripts", label: "AI Scripts", icon: Bot, feature: "scripts" },
  { href: "/settings", label: "Settings", icon: Settings, feature: "settings" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, feature: "admin" },
  { href: "/users", label: "Users", icon: Users, feature: "users" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { me } = useMe();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Shared: Overview and Settings request this too, and this component sits in
    // the layout — so without dedupe a single page load fired it twice at once.
    sharedGet<Usage>("/api/usage").then(setUsage);
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  // Close the mobile drawer on navigation, or it covers the page you just opened.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore (private mode / storage disabled)
    }
  }

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Show only the sections this role can use. Until /api/me resolves, `me` is
  // null and the nav is briefly empty (the result is cached, so this happens once).
  const links = NAV.filter((l) => me?.capabilities?.includes(l.feature));

  const cap = usage?.subscription?.plans?.max_messages_per_month ?? null;
  const used = usage?.totals?.messages ?? 0;
  const planName = usage?.subscription?.plans?.name;

  const body = (
    <>
      <div className="px-5 py-5">
        <Logo size="sm" subtitle="AI Agent Admin" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              }`}
            >
              <Icon size={17} strokeWidth={2.2} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      {/* Real plan + usage, not an "Upgrade Plan" button — there's no billing
          flow to send anyone to, so it would be a dead end. */}
      <div className="border-t border-[var(--border)] p-3">
        {planName && (
          <Link
            href="/settings"
            className="mb-2 block rounded-xl bg-[var(--panel-bg)] p-3 transition-colors hover:bg-[var(--surface-1)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-bold text-[var(--text-1)]">{planName}</span>
              <span className="flex-shrink-0 text-[10px] text-[var(--text-4)]">
                {cap === null ? `${used} replies` : `${used}/${cap}`}
              </span>
            </div>
            {cap !== null && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (used / cap) * 100)}%`,
                    background: used >= cap ? "var(--danger)" : "var(--accent)",
                  }}
                />
              </div>
            )}
          </Link>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
            {dark ? "Light" : "Dark"}
          </button>
          <button
            onClick={handleLogout}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: a top bar with a drawer trigger. The desktop sidebar is a
          fixed column, so it can't just reflow — the app is used on phones. */}
      <div
        className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 md:hidden"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <Logo size="sm" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-1)]"
        >
          <Menu size={18} />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-[260px] flex-col border-r border-[var(--border)]"
            style={{ background: "var(--sidebar-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-4)] hover:bg-[var(--surface-1)]"
            >
              <X size={16} />
            </button>
            {body}
          </aside>
        </div>
      )}

      <aside
        className="hidden w-[232px] flex-shrink-0 flex-col border-r border-[var(--border)] md:flex"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {body}
      </aside>
    </>
  );
}
