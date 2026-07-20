"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt,
  CalendarClock,
  UtensilsCrossed,
  AlertTriangle,
  X,
} from "lucide-react";

// All detected takeaway orders + reservations across accounts, in two columns.
//
// The data is DETECTED from chat text (see /api/analytics/accounts) — a heuristic
// estimate, not a ledger. Reservations track TableCheck links the agent shared;
// they can't reflect bookings the app never hears back about. Both are labelled as
// such so a low/zero count reads as truthful, not broken.

type AccountStat = {
  account_id: string;
  username: string | null;
  name: string | null;
  takeaway_orders: number;
  reservations: number;
  orders: { customer: string; summary: string; at: string }[];
  reservation_list: { customer: string; detail: string; at: string }[];
};

// A flattened row of either kind, tagged with its account, ready to render/filter.
type Row = { kind: "order" | "reservation"; customer: string; account: string; body: string; at: string };

type Range = "all" | "week" | "month" | "year";
const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { week: 7, month: 30, year: 365 };
const RANGE_LABEL: Record<Range, string> = { all: "All", week: "Week", month: "Month", year: "Year" };

function relTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 2_592_000) return `${Math.floor(secs / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// useSearchParams opts the route out of static prerender unless it's under Suspense
// — same wrapper pattern as /scripts and /businesses.
export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="p-8 text-xs text-[var(--text-4)]">Loading…</p>}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const params = useSearchParams();
  const accountParam = params.get("account"); // set by the dashboard card links

  const [stats, setStats] = useState<AccountStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [account, setAccount] = useState<string>("all");
  const [range, setRange] = useState<Range>("all");
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    fetch("/api/analytics/accounts")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: AccountStat[]) => setStats(Array.isArray(d) ? d : []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (accountParam) setAccount(accountParam);
  }, [accountParam]);

  // Escape closes the detail popup.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const labelFor = (a: AccountStat) => (a.username ? `@${a.username}` : a.name || "Account");

  const cutoff = range === "all" ? 0 : Date.now() - RANGE_DAYS[range] * 86_400_000;
  const inRange = (at: string) => range === "all" || new Date(at).getTime() >= cutoff;

  const scoped = account === "all" ? stats : stats.filter((a) => a.account_id === account);

  const orders = useMemo(
    () =>
      scoped
        .flatMap((a) =>
          a.orders.map<Row>((o) => ({
            kind: "order",
            customer: o.customer,
            account: labelFor(a),
            body: o.summary,
            at: o.at,
          }))
        )
        .filter((r) => inRange(r.at))
        .sort((x, y) => y.at.localeCompare(x.at)),
    [scoped, range] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const reservations = useMemo(
    () =>
      scoped
        .flatMap((a) =>
          a.reservation_list.map<Row>((r) => ({
            kind: "reservation",
            customer: r.customer,
            account: labelFor(a),
            body: r.detail,
            at: r.at,
          }))
        )
        .filter((r) => inRange(r.at))
        .sort((x, y) => y.at.localeCompare(x.at)),
    [scoped, range] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (loading) return <p className="p-8 text-xs text-[var(--text-4)]">Loading…</p>;

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <AlertTriangle size={22} className="mx-auto text-[var(--danger)]" />
          <p className="mt-3 text-[13px] font-bold text-[var(--text-1)]">Couldn&apos;t load orders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 md:px-6">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-1)]">
            Orders &amp; Reservations
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
            Detected from conversations — an estimate, not a live order system.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date range — rolling windows, applied client-side on each row's timestamp. */}
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-0.5">
            {(["all", "week", "month", "year"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  range === r
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--text-4)] hover:text-[var(--text-2)]"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>

          {stats.length > 1 && (
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              aria-label="Filter by account"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-2 text-xs font-semibold text-[var(--text-2)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All accounts</option>
              {stats.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {labelFor(a)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
        <Column
          icon={<UtensilsCrossed size={15} className="text-[var(--accent)]" />}
          title="Takeaway orders"
          caption="detected from chats"
          rows={orders}
          empty="No takeaway orders in this range."
          onOpen={setSelected}
        />
        <Column
          icon={<CalendarClock size={15} className="text-[var(--accent)]" />}
          title="Reservations"
          caption="booking links shared"
          rows={reservations}
          empty="No reservation links shared in this range. Reservations complete on TableCheck, which doesn't report bookings back to the app."
          onOpen={setSelected}
        />
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-[440px] rounded-2xl border border-[var(--border-strong)] bg-[var(--modal-bg)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                  {selected.kind === "order" ? (
                    <Receipt size={16} className="text-[var(--accent)]" />
                  ) : (
                    <CalendarClock size={16} className="text-[var(--accent)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-bold text-[var(--text-1)]">
                    {selected.customer}
                  </h3>
                  <p className="truncate text-[11px] text-[var(--text-4)]">
                    {selected.account} · {fullDate(selected.at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-5)]">
              {selected.kind === "order" ? "Order summary" : "Reservation"} · detected from chat
            </p>
            <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-1)] p-3 text-[12px] leading-relaxed text-[var(--text-2)]">
              {selected.body || "No further detail captured."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({
  icon,
  title,
  caption,
  rows,
  empty,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  rows: Row[];
  empty: string;
  onOpen: (r: Row) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-bold text-[var(--text-1)]">{title}</h2>
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
          {rows.length}
        </span>
        <span className="text-[10px] text-[var(--text-5)]">{caption}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] px-4 py-6 text-center text-[12px] leading-relaxed text-[var(--text-5)]">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <button
              key={i}
              onClick={() => onOpen(r)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[var(--text-1)]">{r.customer}</p>
                <p className="truncate text-[11px] text-[var(--text-4)]">{r.account}</p>
              </div>
              <span className="flex-shrink-0 text-[10px] text-[var(--text-5)]">{relTime(r.at)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
