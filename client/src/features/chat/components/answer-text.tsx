'use client';

import type { QuoteDto } from '@ca/shared';
import { isQuoteClickable } from '@ca/shared';
import { cn } from '@/lib/cn';

/**
 * Renders answer text with its `[n]` markers.
 *
 * A marker becomes a link ONLY when a verified quote backs it. Three cases, and the
 * distinction is deliberate (ARCHITECTURE section 7):
 *  - verified quote  -> a button that opens the document at the passage;
 *  - unverified      -> a muted marker, so the reader can see the claim was not supported;
 *  - no quote at all -> plain text, never a link that goes nowhere.
 */
export function AnswerText({
  text,
  quotes,
  onOpenQuote,
}: {
  text: string;
  quotes: QuoteDto[];
  onOpenQuote?: (quote: QuoteDto) => void;
}) {
  const byCitation = new Map(quotes.map((quote) => [quote.citation, quote]));
  const parts = text.split(/(\[\d{1,2}\])/g);

  return (
    <div className="whitespace-pre-wrap text-body text-fg">
      {parts.map((part, index) => {
        const marker = /^\[(\d{1,2})\]$/.exec(part);
        if (marker === null) return <span key={index}>{part}</span>;

        const quote = byCitation.get(Number(marker[1]));
        if (quote === undefined) {
          // A marker the model invented, with no quote behind it.
          return (
            <span key={index} className="text-fg-subtle">
              {part}
            </span>
          );
        }

        if (!isQuoteClickable(quote) || onOpenQuote === undefined) {
          return (
            <span
              key={index}
              className="cursor-not-allowed font-mono text-caption text-unverified line-through"
              title={quote.text}
            >
              {part}
            </span>
          );
        }

        return (
          <button
            key={index}
            type="button"
            onClick={() => onOpenQuote(quote)}
            className={cn(
              'mx-0.5 rounded-sm bg-verified-bg px-1 font-mono text-caption text-verified',
              'hover:bg-verified-bg hover:underline',
            )}
            title={quote.text}
          >
            {part}
          </button>
        );
      })}
    </div>
  );
}
