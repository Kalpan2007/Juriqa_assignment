import type { AnswerStatus, MessageStatus, QuoteDto } from '@ca/shared';

/**
 * Decides what to tell the user about how trustworthy an answer is
 * (ARCHITECTURE section 7, decision D11).
 *
 * Four outcomes:
 *   ANSWERED    — at least one quote was verified against the document.
 *   NOT_FOUND   — the model said the answer is not in what it read. Honest, not a failure.
 *   UNSUPPORTED — there is an answer, but NOTHING in it could be verified. This is the one
 *                 that gets a warning banner, because a fluent unsupported answer is the
 *                 most dangerous output this app can produce.
 *   PARTIAL     — the user pressed Stop.
 *
 * The PARTIAL case is why this is its own module. Quotes are emitted last, so a stopped
 * answer almost always has zero verified quotes — and classifying it UNSUPPORTED would
 * accuse the app of making something up when the user simply interrupted it. A STOPPED
 * message is therefore never UNSUPPORTED.
 */

/** Phrases a model uses when it is saying "this is not in the document". */
const NOT_FOUND_PATTERNS: readonly RegExp[] = [
  /\bnot (?:found|present|stated|specified|mentioned|included|addressed)\b/i,
  /\b(?:could|can)(?:not|'t) (?:find|locate|determine)\b/i,
  // `do(?:es)?` covers both "the document does not mention" and "the sections do not
  // mention" — the plural is the more common phrasing when the model refers to excerpts.
  /\bdo(?:es)? not (?:appear|contain|mention|specify|state|address|include|provide)\b/i,
  /\bno (?:information|mention|reference|provision|clause|answer)\b/i,
  /\bis not (?:covered|dealt with)\b/i,
  /\bthe (?:excerpts|sections|document) (?:provided )?do(?:es)? not\b/i,
  /\bI (?:could not|couldn't|cannot|can't) find\b/i,
];

export function looksLikeNotFound(answerText: string): boolean {
  const text = answerText.trim();
  if (text.length === 0) return false;

  /**
   * An answer that CITES something is asserting a finding, not reporting absence.
   *
   * This is the discriminator, and it is more reliable than looking at where in the answer
   * the phrase appears. A good answer routinely ends with a qualification —
   * "…the cap is AED 100,000 [1]. The reviewed sections do not specify a sub-limit." —
   * and classifying that as NOT_FOUND would throw away a correct, well-supported answer.
   * A genuine not-found reply has nothing to cite.
   */
  if (/\[\d{1,2}\]/.test(text)) return false;

  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(text));
}

export function deriveAnswerStatus(input: {
  messageStatus: MessageStatus;
  answerText: string;
  quotes: readonly QuoteDto[];
}): AnswerStatus | null {
  const { messageStatus, answerText, quotes } = input;

  // The user interrupted. Not a judgement on the answer (decision D11).
  if (messageStatus === 'STOPPED') return 'PARTIAL';

  // A failed request has an error code instead; there is nothing to assess.
  if (messageStatus === 'ERROR') return null;
  if (messageStatus === 'STREAMING') return null;

  const verified = quotes.filter((quote) => quote.status === 'VERIFIED');
  if (verified.length > 0) return 'ANSWERED';

  // No quotes, because the model correctly said it could not answer.
  if (looksLikeNotFound(answerText)) return 'NOT_FOUND';

  if (answerText.trim().length === 0) return null;

  // Text, but nothing verifiable behind it.
  return 'UNSUPPORTED';
}

/**
 * Whether to show the amber "could not be verified" banner.
 *
 * Deliberately narrow: only a COMPLETED answer with no verified support earns it. Attaching
 * it to a stopped answer would train users to ignore it, which would defeat the one warning
 * in the product that really matters.
 */
export function shouldWarnUnsupported(status: AnswerStatus | null): boolean {
  return status === 'UNSUPPORTED';
}
