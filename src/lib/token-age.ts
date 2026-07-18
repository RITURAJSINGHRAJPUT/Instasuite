// Instagram tokens last ~60 days. Lifted out of the admin page so the dashboard
// can raise the same warning — a token dying silently is what takes an account
// offline, and it should be visible in more than one place.

export type TokenLevel = "ok" | "unknown" | "warn" | "danger";

export function tokenAge(iso: string | null): { label: string; level: TokenLevel; cls: string } {
  if (!iso) {
    return { label: "expiry unknown", level: "unknown", cls: "text-amber-400" };
  }
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "token EXPIRED", level: "danger", cls: "text-red-400" };
  if (days <= 10) return { label: `token expires in ${days}d`, level: "danger", cls: "text-red-400" };
  if (days <= 20) return { label: `token expires in ${days}d`, level: "warn", cls: "text-amber-400" };
  return { label: `token ok (${days}d)`, level: "ok", cls: "text-[var(--text-5)]" };
}
