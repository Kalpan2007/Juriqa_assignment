/**
 * Decides, with OUR code, whether a quote really exists in a document — and exactly where
 * (ARCHITECTURE section 5). This is the most important function in the application.
 *
 * The contract it upholds: a quote is reported as found only if the SAME WORDS, in the SAME
 * ORDER, appear in that document. Extraction noise is forgiven — spacing, line breaks, curly
 * quotes, dashes, ligatures, hyphenation across a line, words glued together — because all of
 * those are artefacts of reading a PDF, not differences in what the document says. Anything
 * that changes, adds, drops or reorders a word is rejected, because that is a paraphrase and
 * presenting it as a quote would be a lie.
 *
 * No position the model reports is ever used. Offsets come only from where WE found the text.
 */
import {
  joinHyphenBreaks,
  normalize,
  stripWhitespace,
  toOriginalRange,
  type Normalized,
} from './normalizer';

/** How the match was made — shown to the user when it is worth knowing. */
export type MatchKind = 'EXACT_WS' | 'HYPHEN_BREAK' | 'WS_INSENSITIVE' | 'CASE_INSENSITIVE';

export interface QuoteMatch {
  start: number;
  end: number;
}

export type FindQuoteResult =
  | { found: true; kind: MatchKind; matches: QuoteMatch[] }
  | { found: false; reason: RejectionReason };

export type RejectionReason =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INNER_ELLIPSIS'
  | 'NOT_FOUND'
  | 'EMPTY_DOCUMENT';

/** Shorter than this, a "quote" is not evidence of anything. */
export const MIN_QUOTE_CHARS = 8;

/** Longer than this, the model has dumped text rather than quoted it. */
export const MAX_QUOTE_CHARS = 1_500;

/**
 * Pre-computed document text, reused across every quote in an answer.
 * Building this for a 150-page contract is the expensive part, so it is cached per document.
 */
export interface PreparedDocument {
  original: string;
  normalized: Normalized;
  /** Normalised text, lower-cased, for the case-insensitive pass. */
  lowerNorm: string;
  /** Normalised text with all spaces removed, plus a map back into `normalized.norm`. */
  whitespaceless: { stripped: string; map: number[] };
  /** Hyphen-break-joined original, re-normalised, plus a map back to original indices. */
  hyphenJoined: { normalized: Normalized; toOriginal: number[] } | null;
}

export function prepareDocument(fullText: string): PreparedDocument {
  const normalized = normalize(fullText);
  const whitespaceless = stripWhitespace(normalized.norm);

  // Only built when the document actually contains a hyphenated line break; most do not,
  // and this doubles the work for a 150-page document.
  const hasHyphenBreak = /\p{L}-\s*[\r\n]\s*\p{L}/u.test(fullText);
  let hyphenJoined: PreparedDocument['hyphenJoined'] = null;

  if (hasHyphenBreak) {
    const { joined, map } = joinHyphenBreaks(fullText);
    hyphenJoined = { normalized: normalize(joined), toOriginal: map };
  }

  return {
    original: fullText,
    normalized,
    lowerNorm: normalized.norm.toLowerCase(),
    whitespaceless,
    hyphenJoined,
  };
}

/**
 * Strips the decoration models add around a quote: surrounding quotation marks, and leading
 * or trailing ellipses. An ellipsis INSIDE the quote is a different matter — it means words
 * were omitted, so the text as given does not appear in the document and the quote is
 * rejected rather than silently matched in two pieces.
 */
export function cleanQuote(raw: string): { text: string; hasInnerEllipsis: boolean } {
  let text = raw.trim();

  // Leading/trailing ellipses, in either form.
  text = text.replace(/^\s*(\.\.\.|…)\s*/, '').replace(/\s*(\.\.\.|…)\s*$/, '');

  // Matching surrounding quotation marks, straight or curly, possibly repeated.
  for (;;) {
    const first = text[0];
    const last = text[text.length - 1];
    const isQuotePair =
      text.length >= 2 &&
      ((first === '"' && last === '"') ||
        (first === "'" && last === "'") ||
        (first === '“' && last === '”') ||
        (first === '‘' && last === '’'));
    if (!isQuotePair) break;
    text = text.slice(1, -1).trim();
  }

  const hasInnerEllipsis = /\.\.\.|…/.test(text);
  return { text, hasInnerEllipsis };
}

/**
 * Finds a quote in a prepared document, trying four passes and stopping at the first that
 * matches. Every occurrence is returned, because a clause can legitimately appear twice and
 * the user needs to navigate between them.
 */
export function findQuote(document: PreparedDocument, rawQuote: string): FindQuoteResult {
  if (document.original.length === 0) {
    return { found: false, reason: 'EMPTY_DOCUMENT' };
  }

  const { text, hasInnerEllipsis } = cleanQuote(rawQuote);

  if (hasInnerEllipsis) {
    // "A ... B" is two fragments, not a quote. Matching them separately would let the model
    // join unrelated passages and have it presented as one continuous quotation.
    return { found: false, reason: 'INNER_ELLIPSIS' };
  }

  const quoteNorm = normalize(text).norm;

  if (quoteNorm.length < MIN_QUOTE_CHARS) return { found: false, reason: 'TOO_SHORT' };
  if (quoteNorm.length > MAX_QUOTE_CHARS) return { found: false, reason: 'TOO_LONG' };

  // --- pass 1: whitespace-normalised exact match -----------------------------
  const exact = findAllInNormalized(document, quoteNorm);
  if (exact.length > 0) return { found: true, kind: 'EXACT_WS', matches: exact };

  // --- pass 2: also join words hyphenated across a line break ----------------
  if (document.hyphenJoined !== null) {
    const hyphen = findAllInHyphenJoined(document, quoteNorm);
    if (hyphen.length > 0) return { found: true, kind: 'HYPHEN_BREAK', matches: hyphen };
  }

  // --- pass 3: ignore whitespace entirely ------------------------------------
  // Handles extraction that glued words together or split one apart. The characters and
  // their order must still match exactly, so a paraphrase cannot pass here.
  const whitespaceless = findAllWhitespaceless(document, quoteNorm);
  if (whitespaceless.length > 0) {
    return { found: true, kind: 'WS_INSENSITIVE', matches: whitespaceless };
  }

  // --- pass 4: case-insensitive (decision D6) --------------------------------
  // Models routinely re-capitalise a quote lifted from mid-sentence ("The Company shall"
  // for "the Company shall"). The words are identical, so rejecting it would show a genuine
  // quote as unverified — but the match kind records it, and the UI says so.
  const caseInsensitive = findAllCaseInsensitive(document, quoteNorm);
  if (caseInsensitive.length > 0) {
    return { found: true, kind: 'CASE_INSENSITIVE', matches: caseInsensitive };
  }

  return { found: false, reason: 'NOT_FOUND' };
}

function findAllInNormalized(document: PreparedDocument, quoteNorm: string): QuoteMatch[] {
  return collectOccurrences(document.normalized.norm, quoteNorm).map((normStart) =>
    toOriginalRange(
      document.normalized,
      normStart,
      normStart + quoteNorm.length,
      document.original.length,
    ),
  );
}

function findAllCaseInsensitive(document: PreparedDocument, quoteNorm: string): QuoteMatch[] {
  return collectOccurrences(document.lowerNorm, quoteNorm.toLowerCase()).map((normStart) =>
    toOriginalRange(
      document.normalized,
      normStart,
      normStart + quoteNorm.length,
      document.original.length,
    ),
  );
}

function findAllInHyphenJoined(document: PreparedDocument, quoteNorm: string): QuoteMatch[] {
  const joined = document.hyphenJoined;
  if (joined === null) return [];

  return collectOccurrences(joined.normalized.norm, quoteNorm).map((normStart) => {
    // Two hops: normalised-joined → joined → original.
    const joinedRange = toOriginalRange(
      joined.normalized,
      normStart,
      normStart + quoteNorm.length,
      joined.toOriginal.length,
    );
    const start = joined.toOriginal[joinedRange.start] ?? 0;
    const lastJoinedIndex = Math.max(joinedRange.start, joinedRange.end - 1);
    const end = (joined.toOriginal[lastJoinedIndex] ?? start) + 1;
    return { start, end: Math.min(end, document.original.length) };
  });
}

function findAllWhitespaceless(document: PreparedDocument, quoteNorm: string): QuoteMatch[] {
  const quoteStripped = quoteNorm.replace(/ /g, '');
  if (quoteStripped.length < MIN_QUOTE_CHARS) return [];

  const { stripped, map } = document.whitespaceless;

  return collectOccurrences(stripped, quoteStripped).map((strippedStart) => {
    const normStart = map[strippedStart] ?? 0;
    const strippedEnd = strippedStart + quoteStripped.length - 1;
    const normEnd = (map[strippedEnd] ?? normStart) + 1;
    return toOriginalRange(document.normalized, normStart, normEnd, document.original.length);
  });
}

/**
 * Every start index of `needle` in `haystack`.
 *
 * Overlapping occurrences are included (the search advances by one, not by the needle's
 * length), because a repeated clause can overlap itself and the user is shown "1 of N".
 */
function collectOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const starts: number[] = [];
  let from = 0;

  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    starts.push(index);
    from = index + 1;
  }
  return starts;
}
