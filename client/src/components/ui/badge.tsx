import * as React from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'verified'
  | 'unverified'
  | 'danger'
  | 'processing'
  | 'ready'
  | 'failed';

/**
 * Tone → token mapping lives HERE and nowhere else, so a status colour is decided once
 * (ARCHITECTURE section 13.1 "Enforcement"). Accessibility: colour is never the only signal,
 * so callers pass an icon or explicit text alongside the tone.
 */
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted border-border',
  verified: 'bg-verified-bg text-verified border-verified-border',
  unverified: 'bg-unverified-bg text-unverified border-unverified-border',
  danger: 'bg-danger-bg text-danger border-danger-border',
  processing: 'bg-warning-bg text-status-processing border-unverified-border',
  ready: 'bg-success-bg text-status-ready border-verified-border',
  failed: 'bg-danger-bg text-status-failed border-danger-border',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-caption font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
