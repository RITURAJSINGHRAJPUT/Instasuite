"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  AtSign,
  MessageSquare,
  Coins,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
} from "lucide-react";
import { tokenAge } from "@/lib/token-age";
import VolumeChart, { type Point } from "@/components/VolumeChart";

type Account = {
  id: string;
  username: string | null;
  name: string | null;
  status: string;
  token_expires_at: string | null;
  businesses: { name: string } | null;
};

type Usage = {
  totals: { messages: number; costCents: number };
  subscription: {
    status: string;
    plans: { name: string; max_messages_per_month: number | null } | null;
  } | null;
};

type Volume = { days: number; series: Point[]; total: number };

type BizRow = {
  id: string;
  name: string;
  status: string;
  handles: string[];
  messages: number;
  costCents: number;
  deltaPct: number | null;
};

type AdminAccount = { username: string | null; token_expires_at: string | null; status: string };

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [conversations, setConversations] = useState(0);
  const [pending, setPending] = useState<{ businesses: number; accounts: number } | null>(null);
  const [adminTokens, setAdminTokens] = useState<AdminAccount[]>([]);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [biz, setBiz] = useState<BizRow[]>([]);
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // Everything here comes from endpoints that are already ownership-scoped.
  const load = useCallback(async () => {
    const [a, u, c, p, b] = await Promise.all([
      fetch("/api/account"),
      fetch("/api/usage"),
      fetch("/api/conversations"),
      fetch("/api/admin/pending"), // 404s for non-super-admins
      fetch("/api/analytics/businesses"),
    ]);
    if (a.ok) setAccounts(await a.json());
    if (u.ok) setUsage(await u.json());
    if (c.ok) {
      const list = await c.json();
      setConversations(Array.isArray(list) ? list.length : 0);
    }
    if (p.ok) {
      const d = await p.json();
      setPending({
        businesses: (d.businesses ?? []).filter((x: { status: string }) => x.status === "pending").length,
        accounts: (d.accounts ?? []).filter((x: { status: string }) => x.status === "pending").length,
      });
      setAdminTokens(d.accounts ?? []);
    }
    if (b.ok) setBiz(await b.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Separate from load(): re-runs on the 7/30 toggle without refetching the rest.
  useEffect(() => {
    fetch(`/api/analytics/volume?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setVolume)
      .catch(() => {});
  }, [days]);

  const cap = usage?.subscription?.plans?.max_messages_per_month ?? null;
  const used = usage?.totals.messages ?? 0;

  // A token dying silently is what takes an account offline, so it gets top
  // billing. Super-admins see every account's; clients now see their own too
  // (token_expires_at was added to /api/account for exactly this).
  const tokenSource: AdminAccount[] = adminTokens.length
    ? adminTokens
    : accounts.map((a) => ({
        username: a.username,
        token_expires_at: a.token_expires_at,
        status: a.status,
      }));

  const atRisk = tokenSource.filter((t) => {
    if (t.status === "disabled") return false;
    const { level } = tokenAge(t.token_expires_at);
    return level === "warn" || level === "danger";
  });

  const filteredBiz = q
    ? biz.filter(
        (b) =>
          b.name.toLowerCase().includes(q.toLowerCase()) ||
          b.handles.some((h) => h.toLowerCase().includes(q.toLowerCase()))
      )
    : biz;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      {/* The search bar from the reference lives on this page only; other
          screens bring their own header. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-1)]">Overview</h1>
          <p className="text-[13px] text-[var(--text-4)]">
            This month, across your connected accounts.
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-5)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search businesses…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] py-2 pl-9 pr-3 text-base text-[var(--text-1)] placeholder:text-[var(--text-5)] focus:border-[var(--accent)] focus:outline-none md:w-64 md:text-[13px]"
          />
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-xs text-[var(--text-4)]">Loading…</p>
      ) : (
        <>
          {/* Things that need attention come first */}
          {atRisk.length > 0 && (
            <div className="mt-5 rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[var(--danger)]">
                <AlertTriangle size={14} />
                {atRisk.length} account{atRisk.length === 1 ? "" : "s"} need attention
              </p>
              {atRisk.map((t) => (
                <p key={t.username} className="mt-1 text-[11px] text-[var(--text-4)]">
                  @{t.username} — {tokenAge(t.token_expires_at).label}. Instagram tokens last ~60
                  days; the daily refresh job renews them.
                </p>
              ))}
            </div>
          )}

          {pending && pending.businesses + pending.accounts > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--warn)]/25 bg-[var(--warn-soft)] p-4">
              <p className="text-[13px] font-semibold text-[var(--warn)]">
                {pending.businesses} business{pending.businesses === 1 ? "" : "es"} and{" "}
                {pending.accounts} account{pending.accounts === 1 ? "" : "s"} awaiting approval
              </p>
              <Link
                href="/admin"
                className="flex-shrink-0 text-[11px] font-semibold text-[var(--text-3)] hover:text-[var(--text-1)]"
              >
                Review →
              </Link>
            </div>
          )}

          {/* Four real numbers. The reference's "AI Efficiency" card is absent:
              no accuracy signal exists in the schema to compute one from. */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Building2} label="Conversations" value={String(conversations)} sub="all time" />
            <Stat
              icon={MessageSquare}
              label="AI replies"
              value={cap === null ? String(used) : `${used}/${cap}`}
              sub={usage?.subscription?.plans?.name ? `${usage.subscription.plans.name} plan` : "this month"}
            />
            <Stat
              icon={Coins}
              label="AI cost"
              value={`$${((usage?.totals.costCents ?? 0) / 100).toFixed(2)}`}
              sub="this month"
            />
            <Stat
              icon={AtSign}
              label="Accounts"
              value={String(accounts.length)}
              sub={`${accounts.filter((a) => a.status === "approved").length} approved`}
            />
          </div>

          {cap !== null && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (used / cap) * 100)}%`,
                    background: used >= cap ? "var(--danger)" : "var(--accent)",
                  }}
                />
              </div>
              {used >= cap && (
                <p className="mt-2 text-[11px] font-semibold text-[var(--danger)]">
                  Monthly limit reached — auto-replies are paused until the period resets.
                </p>
              )}
            </div>
          )}

          {/* Message volume */}
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text-1)]">Message volume</h2>
                <p className="text-[12px] text-[var(--text-4)]">
                  Messages in and out, across your accounts
                </p>
              </div>
              <div className="flex gap-1 rounded-lg bg-[var(--surface-1)] p-0.5">
                {[7, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`rounded-md px-3 py-1 text-[11px] font-bold transition-colors ${
                      days === d
                        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "text-[var(--text-4)] hover:text-[var(--text-2)]"
                    }`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              {!volume ? (
                <p className="py-12 text-center text-xs text-[var(--text-5)]">Loading…</p>
              ) : volume.total === 0 ? (
                // A real empty state, not a flat zero-line pretending to be a trend.
                <div className="py-12 text-center">
                  <p className="text-[13px] font-semibold text-[var(--text-3)]">
                    No messages in the last {volume.days} days
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-5)]">
                    New DMs will appear here as they arrive.
                  </p>
                </div>
              ) : (
                <>
                  <VolumeChart series={volume.series} />
                  <p className="mt-1 text-[11px] text-[var(--text-5)]">
                    {volume.total.toLocaleString()} message{volume.total === 1 ? "" : "s"} in this period
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Business performance */}
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-[15px] font-bold text-[var(--text-1)]">Business performance</h2>
              <p className="text-[12px] text-[var(--text-4)]">AI replies and spend, last 7 days</p>
            </div>

            {filteredBiz.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-[var(--text-5)]">
                {q ? "No businesses match that search." : "No businesses yet."}{" "}
                {!q && (
                  <Link href="/businesses" className="text-[var(--accent)] underline">
                    Add one →
                  </Link>
                )}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left">
                      {["Business", "Status", "AI replies", "Cost"].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-5)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBiz.map((b) => (
                      <tr key={b.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-5 py-3.5">
                          <p className="text-[13px] font-bold text-[var(--text-1)]">{b.name}</p>
                          <p className="text-[11px] text-[var(--text-4)]">
                            {b.handles.length
                              ? b.handles.map((h) => `@${h}`).join(", ")
                              : "No account connected"}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusPill status={b.status} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[13px] font-bold text-[var(--text-1)]">{b.messages}</span>
                          {/* Only when there's a prior week to compare against;
                              null means no baseline, so no delta is shown. */}
                          {b.deltaPct !== null && b.deltaPct !== 0 && (
                            <span
                              className={`ml-2 inline-flex items-center gap-0.5 text-[11px] font-bold ${
                                b.deltaPct > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                              }`}
                            >
                              {b.deltaPct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {Math.abs(b.deltaPct)}%
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[var(--text-3)]">
                          ${(b.costCents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
        <Icon size={16} className="text-[var(--accent)]" />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-5)]">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-[var(--text-1)]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{sub}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-[var(--ok-soft)] text-[var(--ok)]",
    pending: "bg-[var(--warn-soft)] text-[var(--warn)]",
    rejected: "bg-[var(--danger-soft)] text-[var(--danger)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[status] ?? "bg-[var(--surface-2)] text-[var(--text-4)]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
