import Sidebar from "@/components/Sidebar";
import AppGuard from "@/components/AppGuard";

// Shell for every authenticated page. A route group, so the URLs are unchanged
// ("(app)" is stripped from the path) and src/proxy.ts still gates them by URL.
//
// This renders the sidebar ONLY — no global topbar. The search/notification bar
// belongs to Overview alone; Inbox and Scripts bring their own headers. That
// also keeps the inbox's full-height 3-pane layout from fighting a chrome it
// would have to subtract from its own height.
//
// Axis flips at md: a top bar above the content on phones, a fixed column beside
// it on desktop. Sidebar renders both halves and hides the wrong one.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-[var(--app-bg)] font-sans md:flex-row">
      <Sidebar />
      {/* min-h-0/min-w-0: without them a flex child refuses to shrink below its
          content, and the inbox's own scroll areas would blow out the viewport. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <AppGuard>{children}</AppGuard>
      </main>
    </div>
  );
}
