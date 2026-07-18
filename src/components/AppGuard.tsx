"use client";

import { usePathname } from "next/navigation";
import { featureForPath } from "@/lib/permissions";
import { useMe } from "@/lib/useMe";

// Central page guard for the app shell. Maps the current path to the feature that
// guards it and renders a "no access" panel if the user's role lacks it. This is
// UX only — the real lock is the server-side gate on each feature API — so it just
// spares users a broken/empty page for a section they can't use.
//
// Rendered inside the (app) layout wrapping {children}; when allowed it returns
// children directly (a fragment, no extra DOM), so page layouts are unchanged.
export default function AppGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useMe();
  const feature = featureForPath(pathname);

  // Not a guarded feature page — don't gate it.
  if (!feature) return <>{children}</>;

  if (loading) {
    return <div className="p-8 text-xs text-[var(--text-4)]">Loading…</div>;
  }

  if (me?.capabilities?.includes(feature)) return <>{children}</>;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-sm font-semibold text-[var(--text-1)]">You don&apos;t have access to this</h1>
        <p className="mt-1.5 text-xs text-[var(--text-4)]">
          Your role doesn&apos;t include this section. Ask a super admin if you need it.
        </p>
      </div>
    </div>
  );
}
