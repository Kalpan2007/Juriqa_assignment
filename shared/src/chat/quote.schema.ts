import { z } from 'zod';

/**
 * A quote, with OUR verdict on whether it is genuine (ARCHITECTURE section 5).
 *
 * `status` is the only thing the UI may use to decide whether to present text as a quotation.
 * It is set by the server's verifier, never by the model.
 */
export const QUOTE_STATUSES = ['VERIFIED', 'UNVERIFIED'] as const;
export const MATCH_KINDS = [
  'EXACT_WS',
  'HYPHEN_BREAK',
  'WS_INSENSITIVE',
  'CASE_INSENSITIVE',
] as const;

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export const matchKindSchema = z.enum(MATCH_KINDS);

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export type MatchKind = z.infer<typeof matchKindSchema>;

/** Where the quote was found. Half-open, into that document's `fullText`. */
export const quoteMatchSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export type QuoteMatchDto = z.infer<typeof quoteMatchSchema>;

export const quoteSchema = z.object({
  id: z.string(),
  /** The `[n]` marker this quote belongs to in the answer text. */
  citation: z.number().int().positive(),
  text: z.string(),
  status: quoteStatusSchema,
  /** Null when the model attributed the quote to a document that is not in this chat. */
  documentId: z.uuid().nullable(),
  /** Shown on the chip in a multi-document chat. Null if the document was deleted. */
  documentName: z.string().nullable(),
  /** Every occurrence we found. Empty when unverified. */
  matches: z.array(quoteMatchSchema),
  matchKind: matchKindSchema.nullable(),
});

export type QuoteDto = z.infer<typeof quoteSchema>;

/**
 * True when a quote may be presented as a genuine quotation and made clickable.
 * One helper, used by every component, so the rule cannot be applied inconsistently.
 */
export function isQuoteClickable(quote: QuoteDto): boolean {
  return quote.status === 'VERIFIED' && quote.documentId !== null && quote.matches.length > 0;
}

/**
 * True when the chip should carry the "capitalisation differs" note (decision D6).
 * The quote IS genuine; only its casing differs from the document.
 */
export function hasCaseDifference(quote: QuoteDto): boolean {
  return quote.status === 'VERIFIED' && quote.matchKind === 'CASE_INSENSITIVE';
}
