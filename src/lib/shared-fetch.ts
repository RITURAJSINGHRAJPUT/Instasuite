"use client";

// Dedupe + briefly cache GET responses that several components ask for at once.
//
// The motivating case is /api/usage: the Sidebar lives in the layout and fetches
// it, and so do Overview and Settings — so loading Overview fired the same request
// twice, simultaneously. That route is the deepest in the app (its handler makes
// several Supabase round trips in series), so the duplicate is expensive on both
// ends.
//
// Two mechanisms, and the first matters more than the second:
//   1. In-flight dedupe — concurrent callers for the same URL share ONE request.
//      This is what collapses the Sidebar/page double-fetch.
//   2. A short TTL so moving between pages that need the same data doesn't refetch.
//      Deliberately short: usage counts change as the agent replies, and showing a
//      stale number is worse than a fast one.
//
// Errors are never cached — a failed load must be retried on the next mount, not
// remembered for the TTL.

type Entry = { at: number; data: unknown };

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export function sharedGet<T>(url: string, ttlMs = DEFAULT_TTL_MS): Promise<T | null> {
  const hit = entries.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data as T);

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T | null>;

  const request = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .then((data) => {
      if (data !== null) entries.set(url, { at: Date.now(), data });
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request as Promise<T | null>;
}

/** Drop a cached URL (or everything) after a mutation that would change it. */
export function invalidateShared(url?: string): void {
  if (url) entries.delete(url);
  else entries.clear();
}
