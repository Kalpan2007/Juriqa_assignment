'use client';

import { AlertTriangle, CheckCircle2, FileX, Quote as QuoteIcon } from 'lucide-react';
import { hasCaseDifference, isQuoteClickable, type QuoteDto } from '@ca/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copy, format } from '@/content/copy';
import { cn } from '@/lib/cn';

/**
 * A quote under an answer (ARCHITECTURE sections 5 and 13.3).
 *
 * The rule this component exists to enforce: only a quote our own code found in the document
 * is presented as a quotation, and only that one is clickable. An unverified quote is still
 * SHOWN — struck through, with an explanation — rather than hidden, because hiding it would
 * conceal that the model invented something and leave its citation marker pointing at nothing.
 *
 * Clickability comes from `isQuoteClickable` in `@ca/shared`, so the server and the UI cannot
 * disagree about which quotes are real.
 */
export function QuoteChip({
  quote,
  showDocumentName = false,
  onOpen,
}: {
  quote: QuoteDto;
  /** True in a multi-document chat, where the source document matters. */
  showDocumentName?: boolean;
  onOpen?: (quote: QuoteDto) => void;
}) {
  const clickable = isQuoteClickable(quote) && onOpen !== undefined;
  const deleted = quote.status === 'VERIFIED' && quote.documentId === null;

  const label = (
    <span className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {quote.status === 'VERIFIED' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
      </span>

      <span className="min-w-0">
        <span className="mr-1 font-mono text-caption">[{quote.citation}]</span>
        <span className={cn('text-small', quote.status === 'UNVERIFIED' && 'line-through')}>
          {quote.text}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-2 text-caption">
          {quote.status === 'VERIFIED' ? (
            <span className="font-medium">{copy.chat.quote.verified}</span>
          ) : (
            <span className="font-medium">{copy.chat.quote.unverified}</span>
          )}

          {/* Decision D6: a genuine quote whose capitalisation differs says so. */}
          {hasCaseDifference(quote) && <span className="italic">{copy.chat.quote.caseNote}</span>}

          {showDocumentName && quote.documentName !== null && (
            <span className="inline-flex items-center gap-1">
              <QuoteIcon className="h-3 w-3" aria-hidden="true" />
              {quote.documentName}
            </span>
          )}

          {quote.matches.length > 1 && (
            <span>{format(copy.chat.quote.occurrence, { index: 1, total: quote.matches.length })}</span>
          )}

          {deleted && (
            <span className="inline-flex items-center gap-1">
              <FileX className="h-3 w-3" aria-hidden="true" />
              {copy.chat.quote.documentDeleted}
            </span>
          )}
        </span>
      </span>
    </span>
  );

  const toneClasses =
    quote.status === 'VERIFIED'
      ? 'border-verified-border bg-verified-bg/70 text-verified'
      : 'border-unverified-border bg-unverified-bg/70 text-unverified';

  if (!clickable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('w-full rounded-lg border p-3 text-left shadow-xs', toneClasses)}
            aria-disabled="true"
          >
            {label}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {quote.status === 'UNVERIFIED'
            ? copy.chat.quote.unverifiedHint
            : copy.chat.quote.documentDeleted}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      onClick={() => onOpen(quote)}
      className={cn(
        'group relative w-full cursor-pointer rounded-lg border p-3 text-left transition-all shadow-xs hover:border-primary hover:shadow-sm',
        toneClasses,
      )}
    >
      <div className="flex flex-col gap-2">
        {label}

        {/* High-visibility Action Button for Feature 5 (Citation Highlighting) */}
        {quote.status === 'VERIFIED' && (
          <div className="mt-1 flex items-center justify-between border-t border-verified-border/60 pt-2">
            <span className="flex items-center gap-1.5 text-micro font-medium text-verified">
              <span className="h-1.5 w-1.5 rounded-full bg-verified animate-pulse" />
              Coordinate Match Ready
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(quote);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-verified px-2.5 py-1 text-caption font-semibold text-white shadow-xs transition-transform hover:scale-105 active:scale-95"
            >
              <span>📍 Highlight in Contract</span>
              <span className="text-micro opacity-80">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
