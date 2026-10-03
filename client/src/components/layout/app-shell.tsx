'use client';

import { useState, type ReactNode } from 'react';
import { Menu, X, Scale } from 'lucide-react';
import { Sidebar } from './sidebar';

/**
 * Responsive App Shell:
 * - Desktop (md+): Fixed sticky sidebar on the left with spacious content area
 * - Mobile/Tablet (<md): Executive top bar with branding + hamburger button,
 *   opening a slide-out drawer sheet with backdrop blur.
 */
export function AppShell({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden shrink-0 md:block md:h-dvh md:sticky md:top-0">
        {sidebar ?? <Sidebar />}
      </aside>

      {/* Mobile Top Navigation Bar */}
      <header className="sticky top-0 z-header flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="text-small font-semibold tracking-tight text-fg">Contract Analyzer</span>
            <span className="text-micro text-fg-subtle">Lexora Legal Suite</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-muted text-fg hover:bg-surface-hover"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-modal flex md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-modal flex h-full w-72 flex-col bg-surface shadow-modal">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Responsive Main Content Area */}
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-8" style={{ maxWidth: 'var(--layout-content-max)' }}>
        {children}
      </main>
    </div>
  );
}
