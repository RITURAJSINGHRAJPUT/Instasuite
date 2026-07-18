"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Link2, Unlink, FileText, Loader2, Building2, AlertTriangle, Check } from "lucide-react";

// lucide-react v1 removed every brand logo, so the Instagram mark is inlined.
// Same paths as the icon the codebase used before lucide was added.
function InstagramGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

type Account = {
  id: string;
  ig_account_id: string;
  username: string | null;
  name: string | null;
  status: string;
  script_id: string | null;
};

type Business = {
  id: string;
  name: string;
  status: string;
  default_script_id: string | null;
  instagram_accounts: Account[];
};

const badge = (status: string) =>
  status === "approved"
    ? "bg-[var(--ok-soft)] text-[var(--ok)]"
    : status === "pending"
      ? "bg-[var(--warn-soft)] text-[var(--warn)]"
      : "bg-[var(--danger-soft)] text-[var(--danger)]";

// useSearchParams() opts a route out of static prerendering unless it sits inside
// a Suspense boundary, so the page splits into a wrapper + this inner component.
export default function BusinessesPage() {
  return (
    <Suspense fallback={<p className="p-8 text-xs text-[var(--text-4)]">Loading…</p>}>
      <BusinessesInner />
    </Suspense>
  );
}

// The business/account half of what used to be one /settings page. Script editing
// now lives at /scripts rather than in a modal here — one editor, one place.
function BusinessesInner() {
  const params = useSearchParams();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // The OAuth callback can't return JSON to a browser navigation, so it reports
  // back through the query string.
  const igConnected = params.get("ig_connected");
  const igError = params.get("ig_error");
  const igWarning = params.get("ig_warning");

  const load = useCallback(async () => {
    const res = await fetch("/api/businesses");
    const data = await res.json();
    if (!res.ok) setError(data?.error || "Couldn't load your businesses.");
    else setBusinesses(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBusiness() {
    if (!newName.trim()) return;
    setError(null);
    const res = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data?.error || "Couldn't create the business.");
    setNewName("");
    load();
  }

  async function connectAccount(businessId: string) {
    if (!token.trim()) return;
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId, access_token: token.trim() }),
    });
    const data = await res.json();
    setConnecting(false);
    if (!res.ok) return setError(data?.error || "Couldn't connect that account.");
    setToken("");
    setConnectFor(null);
    load();
  }

  async function disconnect(accountId: string) {
    await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    load();
  }

  async function setScript(accountId: string, scriptId: string | null) {
    await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_id: scriptId }),
    });
    load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-1)]">Businesses</h1>
      <p className="text-[13px] text-[var(--text-4)]">
        Each business holds its own Instagram accounts and script.
      </p>

      {(error || igError) && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--danger)]">
          <AlertTriangle size={13} className="mt-px flex-shrink-0" />
          {error || igError}
        </p>
      )}

      {igConnected && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--ok)]/25 bg-[var(--ok-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--ok)]">
          <Check size={13} className="mt-px flex-shrink-0" />
          Connected @{igConnected}. It goes live once an admin approves it.
        </p>
      )}

      {/* Connected but not subscribed = the account looks fine and never gets a
          DM. Loud, not silent. */}
      {igWarning && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--warn)]/25 bg-[var(--warn-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--warn)]">
          <AlertTriangle size={13} className="mt-px flex-shrink-0" />
          {igWarning}
        </p>
      )}

      {/* New business */}
      <div className="mt-5 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createBusiness()}
          placeholder="New business name"
          className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--panel-bg)] px-4 py-2.5 text-base text-[var(--text-1)] placeholder:text-[var(--text-6)] focus:border-[var(--accent)] focus:outline-none md:text-sm"
        />
        <button
          onClick={createBusiness}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {loading && <p className="mt-6 text-xs text-[var(--text-4)]">Loading…</p>}

      {!loading && businesses.length === 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] py-12 text-center">
          <Building2 size={22} className="mx-auto text-[var(--text-5)]" />
          <p className="mt-3 text-[13px] font-bold text-[var(--text-1)]">No businesses yet</p>
          <p className="mt-1 text-[12px] text-[var(--text-4)]">
            Add one above — a default script is created with it.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {businesses.map((b) => (
          <div key={b.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold text-[var(--text-1)]">{b.name}</h2>
                <p className="text-[11px] text-[var(--text-4)]">
                  {b.instagram_accounts?.length ?? 0} Instagram account
                  {(b.instagram_accounts?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge(b.status)}`}
                >
                  {b.status}
                </span>
                {b.default_script_id && (
                  <Link
                    href={`/scripts?script=${b.default_script_id}`}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    <FileText size={12} />
                    Edit script
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2.5 border-t border-[var(--border)] pt-4">
              {(b.instagram_accounts ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--text-2)]">
                      {a.username ? `@${a.username}` : a.ig_account_id}
                    </p>
                    <p className="text-[10px] text-[var(--text-5)]">
                      {a.script_id ? "own script" : "inherits business default"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge(a.status)}`}
                    >
                      {a.status}
                    </span>
                    <button
                      onClick={() => setScript(a.id, a.script_id ? null : b.default_script_id)}
                      className="text-[11px] font-semibold text-[var(--text-4)] hover:text-[var(--text-2)]"
                    >
                      {a.script_id ? "Use default" : "Detach"}
                    </button>
                    <button
                      onClick={() => disconnect(a.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-4)] hover:text-[var(--danger)]"
                    >
                      <Unlink size={11} />
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}

              {/* Primary path: real Instagram Business Login. A full-page link,
                  not fetch() — it's an OAuth redirect to instagram.com. */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href={`/api/auth/instagram?business_id=${b.id}`}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "var(--brand-gradient)" }}
                >
                  <InstagramGlyph size={13} />
                  Connect with Instagram
                </a>
                {connectFor !== b.id && (
                  <button
                    onClick={() => {
                      setConnectFor(b.id);
                      setToken("");
                    }}
                    className="text-[11px] font-semibold text-[var(--text-5)] hover:text-[var(--text-3)]"
                  >
                    or paste a token
                  </button>
                )}
              </div>

              {/* Fallback: a token generated by hand in the Meta dashboard. Kept
                  because it's the only route while the app is in Development mode
                  and a customer hasn't been added as a tester. */}
              {connectFor === b.id && (
                <div className="flex gap-2 pt-1">
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    type="password"
                    autoComplete="off"
                    placeholder="Paste a long-lived Instagram access token"
                    className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-1)] placeholder:text-[var(--text-6)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <button
                    onClick={() => connectAccount(b.id)}
                    disabled={connecting || !token.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
                  >
                    {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                    {connecting ? "Checking…" : "Connect"}
                  </button>
                  <button
                    onClick={() => setConnectFor(null)}
                    className="text-xs font-semibold text-[var(--text-4)] hover:text-[var(--text-2)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
