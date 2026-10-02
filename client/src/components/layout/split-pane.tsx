'use client';

import type { ReactNode } from 'react';

/**
 * The document workspace layout: viewer left, chat right (ARCHITECTURE section 13.3).
 *
 * Desktop-first and responsive down to tablet, which section 16 sets as the boundary — below
 * that the panes stack rather than pretending to be a mobile app.
 */
export function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="workspace-split-height flex min-h-0 flex-col gap-4 lg:flex-row">
      <section
        className="min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface"
        style={{ minWidth: 'var(--layout-viewer-min)' }}
        aria-label="Document"
      >
        {left}
      </section>

      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface lg:w-2/5"
        style={{ minWidth: 'var(--layout-chat-panel-min)' }}
        aria-label="Chat"
      >
        {right}
      </section>
    </div>
  );
}
