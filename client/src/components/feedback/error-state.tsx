'use client';

import { AlertTriangle } from 'lucide-react';
import { resolveErrorMessage } from '@/content/error-messages';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * The error state every screen uses. It takes an error CODE rather than a message, so the
 * wording comes from `content/error-messages.ts` and stays consistent everywhere the same
 * failure can happen (ARCHITECTURE section 13.2).
 */
export function ErrorState({
  code,
  serverMessage,
  onRetry,
  className,
}: {
  code?: string;
  serverMessage?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { title, description, action } = resolveErrorMessage(code, serverMessage);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-danger-border bg-danger-bg px-6 py-12 text-center',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
      <h2 className="text-h3 text-fg">{title}</h2>
      <p className="max-w-prose text-small text-fg-muted">{description}</p>
      {onRetry && action ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          {action}
        </Button>
      ) : null}
    </div>
  );
}
