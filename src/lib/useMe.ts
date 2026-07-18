"use client";

import { useEffect, useState } from "react";
import type { Feature } from "@/lib/permissions";

// Client-side view of the current user + capabilities, from GET /api/me. This is
// UX only — the server re-checks every feature API — so it's safe (and desirable)
// to cache it once per page load. The cache is module-scoped so the sidebar and
// the page guard share a single request, and it survives client navigations
// within the app shell.

export type Me = { id: string; email: string | null; role: string; capabilities: Feature[] };

let cache: Me | null = null;
let inflight: Promise<Me | null> | null = null;

function loadMe(): Promise<Me | null> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .then((d) => {
        cache = d;
        return d;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useMe(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setMe(cache);
      setLoading(false);
      return;
    }
    let alive = true;
    loadMe().then((d) => {
      if (!alive) return;
      setMe(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { me, loading };
}

export function useCapability(feature: Feature): { allowed: boolean; loading: boolean; me: Me | null } {
  const { me, loading } = useMe();
  return { allowed: !!me?.capabilities?.includes(feature), loading, me };
}
