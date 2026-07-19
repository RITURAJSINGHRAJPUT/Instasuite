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
  PanelLeftClose,
  ChevronsUpDown,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { ROLE_OPTIONS, type Feature } from "@/lib/permissions";
import { useMe } from "@/lib/useMe";
import { sharedGet } from "@/lib/shared-fetch";
import Logo, { LogoMark } from "./Logo";

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
  // Desktop only — collapses to an icon rail, it never disappears. `open` above is
  // the separate mobile drawer. Not persisted: this component lives in the (app)
  // layout and never remounts, so the choice survives navigating between pages,
  // and a fresh load starts expanded.
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Shared: Overview and Settings request this too, and this component sits in
    // the layout — so without dedupe a single page load fired it twice at once.
    sharedGet<Usage>("/api/usage").then(setUsage);
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  // Close the mobile drawer on navigation, or it covers the page you just opened.
  // The user menu goes with it — a popover left hanging over the new page is worse.
  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Escape closes the user menu. Nothing else in the app does this yet, but a menu
  // that can only be dismissed by clicking is a keyboard dead end.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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

  // There is no name field on profiles — email and role are the whole identity.
  const email = me?.email ?? "Signed in";
  const initial = (me?.email ?? "?").charAt(0);
  // "Super admin", not "super_admin". Falls back to the raw value for a role that
  // somehow isn't in the picker list.
  const roleLabel = ROLE_OPTIONS.find((o) => o.role === me?.role)?.label ?? me?.role ?? "";

  // Rendered twice — once for the desktop aside, once for the mobile drawer. The
  // drawer always passes false: a slide-out panel has no reason to be an icon rail.
  const renderBody = (isCollapsed: boolean) => (
    <>
      <div
        className={`flex items-center gap-2 py-5 ${
          isCollapsed ? "justify-center px-2" : "justify-between px-5"
        }`}
      >
        {isCollapsed ? (
          // The logo IS the expand control on the rail — a separate panel icon
          // beneath it was two adjacent controls doing related jobs. It carries the
          // same hover tooltip as the nav icons so the affordance isn't a secret.
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            aria-expanded={false}
            className="group relative rounded-xl transition-opacity hover:opacity-80"
          >
            <LogoMark size="sm" />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--accent-fg)] opacity-0 shadow-md transition-opacity group-hover:opacity-100 md:block"
              style={{ background: "var(--text-1)" }}
            >
              Expand sidebar
            </span>
          </button>
        ) : (
          <>
            <Logo size="sm" subtitle="AI Agent Admin" />
            {/* md:flex keeps this out of the mobile drawer, which closes with its own X. */}
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              aria-expanded
              title="Collapse sidebar"
              className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] md:flex"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        )}
      </div>

      {/* overflow-visible when collapsed: the tooltips below sit outside the rail,
          and a scroll container would clip them. Safe because icon-only rows are
          short enough that the list doesn't need to scroll. */}
      <nav
        className={`flex-1 ${isCollapsed ? "overflow-visible px-2" : "overflow-y-auto px-3"}`}
      >
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              title={isCollapsed ? l.label : undefined}
              className={`group relative mb-0.5 flex items-center rounded-lg text-[13px] font-semibold transition-colors ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
              } ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              }`}
            >
              <Icon size={17} strokeWidth={2.2} />
              {isCollapsed ? (
                // Label still needs to be reachable by screen readers when it isn't
                // painted, hence sr-only rather than dropping it.
                <span className="sr-only">{l.label}</span>
              ) : (
                l.label
              )}

              {isCollapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--accent-fg)] opacity-0 shadow-md transition-opacity group-hover:opacity-100 md:block"
                  style={{ background: "var(--text-1)" }}
                >
                  {l.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* One button. Plan, usage, theme and log out all live in the popover it
          opens — the footer used to stack all four, which crowded the rail and
          looked like a different design language to the nav above. */}
      <div className={`relative border-t border-[var(--border)] ${isCollapsed ? "p-2" : "p-3"}`}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={isCollapsed ? email : undefined}
          className={`flex w-full items-center rounded-lg py-2 transition-colors hover:bg-[var(--surface-1)] ${
            isCollapsed ? "justify-center px-0" : "gap-2.5 px-2"
          } ${menuOpen ? "bg-[var(--surface-1)]" : ""}`}
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase text-[var(--accent-fg)]"
            style={{ background: "var(--accent)" }}
          >
            {initial}
          </span>
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                {/* No display name exists — profiles stores email and role only —
                    so the email IS the identity here. */}
                <span className="block truncate text-[12px] font-bold text-[var(--text-1)]">
                  {email}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-4)]">
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDown size={13} className="flex-shrink-0 text-[var(--text-5)]" />
            </>
          )}
        </button>

        {menuOpen && (
          <>
            {/* Invisible backdrop purely to catch outside clicks — the same idiom the
                inbox/users modals use, minus the dim, which would be far too heavy
                for a small menu. */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />

            <div
              role="menu"
              aria-label="Account"
              className={`absolute bottom-full z-50 mb-2 w-56 overflow-hidden rounded-xl border border-[var(--border-strong)] shadow-xl ${
                isCollapsed ? "left-2" : "left-3 right-3 w-auto"
              }`}
              style={{ background: "var(--modal-bg)" }}
            >
              <div className="border-b border-[var(--border)] px-3 py-2.5">
                <p className="truncate text-[12px] font-bold text-[var(--text-1)]">{email}</p>
                <p className="truncate text-[10px] text-[var(--text-4)]">{roleLabel}</p>
              </div>

              {planName && (
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block border-b border-[var(--border)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-bold text-[var(--text-1)]">
                      {planName}
                    </span>
                    <span className="flex-shrink-0 text-[10px] text-[var(--text-4)]">
                      {cap === null ? `${used} replies` : `${used}/${cap}`}
                    </span>
                  </span>
                  {cap !== null && (
                    <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (used / cap) * 100)}%`,
                          background: used >= cap ? "var(--danger)" : "var(--accent)",
                        }}
                      />
                    </span>
                  )}
                </Link>
              )}

              <button
                role="menuitem"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)]"
              >
                {dark ? <Sun size={14} /> : <Moon size={14} />}
                {dark ? "Light mode" : "Dark mode"}
              </button>

              <button
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 border-t border-[var(--border)] px-3 py-2.5 text-[12px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          </>
        )}
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
            {/* Never a rail — a slide-out panel that's already an overlay has no
                reason to hide its own labels. */}
            {renderBody(false)}
          </aside>
        </div>
      )}

      {/* Always rendered: collapsing narrows it to an icon rail rather than removing
          it, so it carries its own expand control and page content simply reflows
          against a 72px column. */}
      <aside
        className={`hidden flex-shrink-0 flex-col border-r border-[var(--border)] transition-[width] duration-150 md:flex ${
          collapsed ? "w-[72px]" : "w-[232px]"
        }`}
        style={{ background: "var(--sidebar-bg)" }}
      >
        {renderBody(collapsed)}
      </aside>
    </>
  );
}
