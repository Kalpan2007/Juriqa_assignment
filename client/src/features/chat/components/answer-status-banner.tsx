'use client';

import { AlertTriangle, Info, Square } from 'lucide-react';
import type { AnswerStatus } from '@ca/shared';
import { copy } from '@/content/copy';

/**
 * The banner above an answer whose trustworthiness needs stating (ARCHITECTURE section 7).
 *
 * Only two statuses get one, and the restraint is the point:
 *  - UNSUPPORTED is the amber warning. A fluent answer with nothing verifiable behind it is
 *    the most dangerous output this app can produce, so it says so plainly.
 *  - PARTIAL is a NEUTRAL note, not a warning (decision D11). The user pressed Stop; quotes
 *    arrive last, so there are none, and warning about that would blame the app for the
 *    user's own action — and would train people to ignore the amber banner that matters.
 *
 * ANSWERED and NOT_FOUND get nothing: a supported answer and an honest "not in here" need no
 * explanation.
 */
export function AnswerStatusBanner({ status }: { status: AnswerStatus | null }) {
  if (status === 'UNSUPPORTED') {
    return (
      <div
        className="mb-2 flex items-start gap-2 rounded-md border border-unverified-border bg-unverified-bg px-3 py-2"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-unverified" aria-hidden="true" />
        <span className="text-small text-fg">
          <span className="font-medium">{copy.chat.answerStatus.unsupportedTitle}</span>{' '}
          {copy.chat.answerStatus.unsupportedDescription}
        </span>
      </div>
    );
  }

  if (status === 'PARTIAL') {
    return (
      <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
        <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="text-small text-fg-muted">{copy.chat.stoppedNote}</span>
      </div>
    );
  }

  if (status === 'NOT_FOUND') {
    return (
      <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="text-small text-fg-muted">{copy.chat.answerStatus.notFoundTitle}</span>
      </div>
    );
  }

  return null;
}
