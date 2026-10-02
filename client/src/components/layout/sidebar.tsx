'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Layers, GitCompare } from 'lucide-react';
import { copy } from '@/content/copy';
import { cn } from '@/lib/cn';

const items = [
  { href: '/', label: copy.nav.library, icon: FileText },
  { href: '/ask', label: copy.nav.askAcross, icon: Layers },
  { href: '/compare', label: copy.nav.compare, icon: GitCompare },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-full flex-col gap-1 border-r border-border bg-surface-muted p-3"
      style={{ width: 'var(--layout-sidebar-width)' }}
      aria-label={copy.app.name}
    >
      <div className="px-2 pb-4 pt-2">
        <span className="text-h3 text-fg">{copy.app.name}</span>
      </div>

      {items.map(({ href, label, icon: Icon }) => {
        // `/` must match exactly, or it would stay active on every page.
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-small transition-colors',
              isActive
                ? 'bg-primary-subtle font-medium text-primary'
                : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
