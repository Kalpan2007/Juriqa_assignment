import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * An empty state always offers the next useful action rather than just saying "nothing here"
 * (ARCHITECTURE section 13.3).
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? <div className="text-fg-subtle" aria-hidden="true">{icon}</div> : null}
      <h2 className="text-h3 text-fg">{title}</h2>
      <p className="max-w-prose text-small text-fg-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
