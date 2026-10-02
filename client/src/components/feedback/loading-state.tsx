import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The loading state every screen uses (ARCHITECTURE section 13.3).
 * `aria-live="polite"` so a screen reader announces it without interrupting.
 */
export function LoadingState({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" aria-hidden="true" />
      <p className="text-small text-fg-muted">{message}</p>
    </div>
  );
}
