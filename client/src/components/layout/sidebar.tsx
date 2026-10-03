'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Layers, GitCompare, Scale, ShieldCheck } from 'lucide-react';
import { copy } from '@/content/copy';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './theme-toggle';

const items = [
  { href: '/', label: 'Documents & Library', icon: FileText, badge: 'Library' },
  { href: '/ask', label: 'Cross-Doc Analysis', icon: Layers, badge: 'Multi-Doc' },
  { href: '/compare', label: 'Version Comparison', icon: GitCompare, badge: 'Diffing' },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-full flex-col justify-between border-r border-border bg-surface p-3"
      style={{ width: 'var(--layout-sidebar-width)' }}
      aria-label={copy.app.name}
    >
      <div className="flex flex-col gap-4">
        {/* Workspace Brand Header */}
        <div className="flex items-center gap-2.5 px-2 pt-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold tracking-tight text-fg text-body">Contract Analyzer</span>
            <span className="text-caption font-medium text-fg-subtle">Lexora Legal Suite</span>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Navigation Items */}
        <div className="flex flex-col gap-1">
          <span className="px-2 text-caption font-semibold uppercase tracking-wider text-fg-subtle">
            Workspaces
          </span>
          {items.map(({ href, label, icon: Icon, badge }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-small transition-all',
                  isActive
                    ? 'bg-primary-subtle font-medium text-primary shadow-xs'
                    : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5 truncate">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{label}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-surface-muted text-fg-subtle',
                  )}
                >
                  {badge}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom section: Theme toggle & User Profile */}
      <div className="flex flex-col gap-3 pt-3">
        <div className="h-px bg-border" />

        <ThemeToggle />

        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted p-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-semibold text-caption dark:bg-emerald-950 dark:text-emerald-300">
            SC
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-caption font-medium text-fg">Senior Counsel</span>
            <span className="flex items-center gap-1 text-caption text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              Verified Reviewer
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
