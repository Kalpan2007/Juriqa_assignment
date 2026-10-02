import { z } from 'zod';

/**
 * Parses the quote JSON a model produced, defensively (ARCHITECTURE section 7).
 *
 * Everything here assumes the input is untrustworthy, because it is: it is generated text
 * that merely resembles JSON. Models wrap it in code fences, add prose around it, trail a
 * comma, or return an object where an array was asked for. None of that may take an answer
 * down — a failure means zero quotes and a notice to the user, never a 500.
 *
 * What is NOT done here: nothing is corrected or inferred. A quote whose text cannot be read
 * is dropped rather than guessed at, because a guessed quote is exactly the thing the
 * verification feature exists to prevent.
 */

const rawQuoteSchema = z.object({
  /** The citation marker. Some models emit a string; coerce rather than reject. */
  n: z.coerce.number().int().positive(),
  /** The document alias ("D1"). Absent in a single-document chat. */
  doc: z.string().optional(),
  text: z.string().min(1),
});

export const quotePayloadSchema = z.array(rawQuoteSchema);

export type RawQuote = z.infer<typeof rawQuoteSchema>;

export interface ParsedQuotes {
  quotes: RawQuote[];
  /** Set when the payload could not be read at all — the caller emits a notice. */
  error: string | null;
}

export function parseQuotePayload(raw: string): ParsedQuotes {
  const text = raw.trim();
  if (text.length === 0) return { quotes: [], error: null };

  const candidates = buildCandidates(text);

  for (const candidate of candidates) {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      continue;
    }

    // Some models return `{ "quotes": [...] }` despite being asked for a bare array.
    const array = Array.isArray(json)
      ? json
      : isRecord(json) && Array.isArray(json.quotes)
        ? json.quotes
        : null;

    if (array === null) continue;

    // Parse each entry on its own: one malformed quote must not discard the good ones.
    const quotes: RawQuote[] = [];
    for (const entry of array) {
      const parsed = rawQuoteSchema.safeParse(entry);
      if (parsed.success) quotes.push(parsed.data);
    }

    return { quotes: dedupe(quotes), error: null };
  }

  return { quotes: [], error: 'The quotes for this answer could not be read.' };
}

/**
 * Progressively more forgiving readings of the payload, tried in order.
 * Each one only removes wrapping — none of them edits the quote text itself.
 */
function buildCandidates(text: string): string[] {
  const candidates = [text];

  // ```json ... ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // Prose before or after the array: take the outermost bracket pair.
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }

  // An object wrapper, same idea.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  // A trailing comma before the closing bracket is the single most common malformation.
  candidates.push(...candidates.map((candidate) => candidate.replace(/,\s*([\]}])/g, '$1')));

  return [...new Set(candidates)];
}

/**
 * Drops duplicates, keeping the first occurrence.
 *
 * Models repeat the same quote under two citation numbers surprisingly often. Showing it
 * twice makes an answer look better supported than it is.
 */
function dedupe(quotes: readonly RawQuote[]): RawQuote[] {
  const seen = new Set<string>();
  const result: RawQuote[] = [];

  for (const quote of quotes) {
    const key = `${quote.doc ?? ''}::${quote.text.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(quote);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The `[n]` markers actually used in the answer text.
 *
 * Needed because the two sides can disagree: a model cites `[1]` and `[3]` but supplies
 * quotes 1 and 2. A marker with no quote is rendered as plain text rather than a dead link,
 * and a quote with no marker is still shown, because it is still evidence.
 */
export function extractCitationMarkers(answerText: string): number[] {
  const markers = new Set<number>();
  for (const match of answerText.matchAll(/\[(\d{1,2})\]/g)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) markers.add(value);
  }
  return [...markers].sort((a, b) => a - b);
}
