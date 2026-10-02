/**
 * Normalises text for quote matching, while remembering where every character came from
 * (ARCHITECTURE section 5).
 *
 * The index map is the whole point. We must compare a loose version of the text (so that a
 * line break, a curly quote or a doubled space does not reject a genuine quote) but then
 * report the position in the ORIGINAL text (so the highlight lands on real characters). So
 * normalisation records, for each character it emits, which original index it came from.
 *
 * What is deliberately NOT done here: no case folding, no punctuation removal, no stemming,
 * no word changes. Those would let a paraphrase pass as a genuine quote, which is the one
 * failure this whole feature exists to prevent.
 */

export interface Normalized {
  /** The normalised text. */
  norm: string;
  /** `map[i]` is the index in the original string that `norm[i]` came from. */
  map: number[];
}

/** Curly quotes and primes → their straight equivalents. */
const QUOTE_REPLACEMENTS: Record<string, string> = {
  '‘': "'", // ‘
  '’': "'", // ’
  '‚': "'", // ‚
  '‛': "'", // ‛
  '′': "'", // ′
  '“': '"', // “
  '”': '"', // ”
  '„': '"', // „
  '‟': '"', // ‟
  '″': '"', // ″
};

/** Every dash variant → a plain hyphen. Contracts are full of en dashes. */
const DASH_CHARS = new Set([
  '‐', // ‐ hyphen
  '‑', // ‑ non-breaking hyphen
  '‒', // ‒ figure dash
  '–', // – en dash
  '—', // — em dash
  '―', // ― horizontal bar
  '−', // − minus sign
]);

/** Characters that carry no meaning and are dropped entirely. */
const ZERO_WIDTH_CHARS = new Set([
  '­', // soft hyphen — inserted by hyphenation, invisible
  '​', // zero-width space
  '‌', // zero-width non-joiner
  '‍', // zero-width joiner
  '﻿', // byte-order mark
]);

function isWhitespace(char: string): boolean {
  // \s plus NBSP and the narrow/figure spaces PDF producers emit.
  return /[\s     ]/.test(char);
}

/**
 * Normalises `text`, returning the result and a map back to the original indices.
 *
 * Steps, in this order:
 *  1. NFKC — resolves ligatures (ﬁ → fi) and full-width forms to their plain letters;
 *  2. curly quotes → straight, dash variants → hyphen;
 *  3. drop soft hyphens and zero-width characters;
 *  4. collapse every run of whitespace to a single space;
 *  5. trim.
 *
 * NFKC can map one character to several (ﬁ → f + i). Each produced character points back at
 * the original index, so a match that starts or ends inside a ligature still yields a correct
 * original offset — it simply includes the whole ligature, which is what a highlight needs.
 */
export function normalize(text: string): Normalized {
  const chars: string[] = [];
  const map: number[] = [];

  let pendingSpaceFrom = -1;
  let hasEmitted = false;

  for (let index = 0; index < text.length; index += 1) {
    const original = text[index] ?? '';

    if (ZERO_WIDTH_CHARS.has(original)) continue;

    if (isWhitespace(original)) {
      // Remember that whitespace was seen, but do not emit yet: a run collapses to one space,
      // and trailing whitespace is dropped entirely.
      if (hasEmitted && pendingSpaceFrom === -1) pendingSpaceFrom = index;
      continue;
    }

    if (pendingSpaceFrom !== -1) {
      chars.push(' ');
      map.push(pendingSpaceFrom);
      pendingSpaceFrom = -1;
    }

    const replaced = QUOTE_REPLACEMENTS[original] ?? (DASH_CHARS.has(original) ? '-' : original);

    // NFKC per character, so the index map stays exact.
    const decomposed = replaced.normalize('NFKC');
    for (const char of decomposed) {
      // A combining mark that NFKC left behind carries no meaning for matching.
      if (ZERO_WIDTH_CHARS.has(char)) continue;
      chars.push(char);
      map.push(index);
    }
    hasEmitted = true;
  }

  return { norm: chars.join(''), map };
}

/**
 * Maps a range in normalised space back to the original string.
 *
 * `end` is exclusive, so it maps through the LAST included character and then advances past
 * it — using `map[end]` directly would stop short whenever a space or ligature sat on the
 * boundary.
 */
export function toOriginalRange(
  normalized: Normalized,
  normStart: number,
  normEnd: number,
  originalLength: number,
): { start: number; end: number } {
  const { map } = normalized;
  const start = map[normStart] ?? 0;

  const lastIndex = normEnd - 1;
  const lastOriginal = map[lastIndex];
  if (lastOriginal === undefined) {
    return { start, end: Math.min(start + 1, originalLength) };
  }

  // Advance past every original character that produced the final normalised character
  // (a ligature produces several normalised characters from one original index).
  let end = lastOriginal + 1;
  while (end < originalLength && map[normEnd] === lastOriginal) end += 1;

  return { start, end: Math.min(end, originalLength) };
}

/** Normalised text with ALL whitespace removed, plus a map back to normalised indices. */
export function stripWhitespace(norm: string): { stripped: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < norm.length; index += 1) {
    const char = norm[index] ?? '';
    if (char === ' ') continue;
    chars.push(char);
    map.push(index);
  }
  return { stripped: chars.join(''), map };
}

/**
 * Joins words broken across a line by hyphenation: "liabil-\nity" → "liability".
 *
 * Only applied where a hyphen sits between two letters and the original had a line break
 * after it, so a genuine compound like "non-exclusive" is never joined.
 */
export function joinHyphenBreaks(
  original: string,
): { joined: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < original.length; index += 1) {
    const char = original[index] ?? '';

    if (char === '-') {
      // Look ahead past whitespace for a letter, and require a letter behind.
      let lookahead = index + 1;
      let sawLineBreak = false;
      while (lookahead < original.length && isWhitespace(original[lookahead] ?? '')) {
        if (original[lookahead] === '\n' || original[lookahead] === '\r') sawLineBreak = true;
        lookahead += 1;
      }
      const before = chars[chars.length - 1] ?? '';
      const after = original[lookahead] ?? '';

      if (sawLineBreak && /\p{L}/u.test(before) && /\p{L}/u.test(after)) {
        // Drop the hyphen and the break: the word continues.
        index = lookahead - 1;
        continue;
      }
    }

    chars.push(char);
    map.push(index);
  }

  return { joined: chars.join(''), map };
}
