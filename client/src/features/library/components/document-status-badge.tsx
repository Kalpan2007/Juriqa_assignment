'use client';

import { CheckCircle2, Clock, Loader2, AlertTriangle } from 'lucide-react';
import type { DocumentStatus } from '@ca/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copy } from '@/content/copy';

/**
 * The status of a document, as one badge.
 *
 * Status → tone and status → icon are decided HERE and nowhere else (ARCHITECTURE section
 * 13.1 "Enforcement"), so the same status can never be a different colour on another screen.
 *
 * Accessibility: colour is never the only signal. Every state carries an icon and a word, and
 * the processing states animate, so the badge still reads correctly in greyscale.
 */
const STATUS_STYLE: Record<DocumentStatus, { tone: BadgeTone; label: string; spinning: boolean }> = {
  UPLOADED: { tone: 'neutral', label: copy.library.status.uploaded, spinning: false },
  EXTRACTING: { tone: 'processing', label: copy.library.status.extracting, spinning: true },
  INDEXING: { tone: 'processing', label: copy.library.status.indexing, spinning: true },
  READY: { tone: 'ready', label: copy.library.status.ready, spinning: false },
  FAILED: { tone: 'failed', label: copy.library.status.failed, spinning: false },
};

function StatusIcon({ status, spinning }: { status: DocumentStatus; spinning: boolean }) {
  if (spinning) return <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />;
  if (status === 'READY') return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
  if (status === 'FAILED') return <AlertTriangle className="h-3 w-3" aria-hidden="true" />;
  return <Clock className="h-3 w-3" aria-hidden="true" />;
}

export function DocumentStatusBadge({
  status,
  statusDetail,
  errorMessage,
}: {
  status: DocumentStatus;
  statusDetail?: string | null;
  errorMessage?: string | null;
}) {
  const { tone, label, spinning } = STATUS_STYLE[status];

  /**
   * The detail is the answer to "is anything actually happening?" — for a 150-page document
   * it reads "Extracting page 42 of 150". A failure shows its own reason instead, because a
   * bare "Could not be read" leaves the user with nothing to act on.
   */
  const detail = status === 'FAILED' ? errorMessage : statusDetail;

  const badge = (
    <Badge tone={tone}>
      <StatusIcon status={status} spinning={spinning} />
      {label}
    </Badge>
  );

  if (!detail) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {badge}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{badge}</span>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
      {/* Also shown inline, not only in a tooltip: progress a user must hover to see is
          progress they will not see. aria-live announces each change once. */}
      <span className="text-caption text-fg-muted" aria-live="polite">
        {detail}
      </span>
    </span>
  );
}
