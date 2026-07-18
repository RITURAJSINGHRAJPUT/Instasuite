import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    // Theme vars rather than hardcoded grays: these pages previously used a
    // `dark:` class, which keys off the OS and so ignored the app's own toggle.
    <main className="mx-auto max-w-3xl px-6 py-16 font-sans">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-1)]">{title}</h1>
      <p className="mt-2 text-sm text-[var(--text-4)]">Last updated: {updated}</p>
      <div className="mt-8 space-y-6 leading-relaxed text-[var(--text-2)] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--text-1)] [&_a]:text-[var(--accent)] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}
