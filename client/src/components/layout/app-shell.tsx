import type { ReactNode } from 'react';

/**
 * Sidebar + main area (ARCHITECTURE section 13.3). Desktop-first and responsive down to
 * tablet, which is an explicit non-goal boundary in section 16 — the sidebar collapses to a
 * top bar below that rather than pretending to be a mobile app.
 */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="shrink-0 md:h-dvh md:sticky md:top-0">{sidebar}</div>
      <main className="min-w-0 flex-1 px-6 py-8" style={{ maxWidth: 'var(--layout-content-max)' }}>
        {children}
      </main>
    </div>
  );
}
