/**
 * Splits a contract into clauses at its real heading boundaries (ARCHITECTURE section 4).
 *
 * This is load-bearing for two features, which is why it is its own pure module:
 *   - chunking (F1) builds retrieval units from these segments, so a chunk tends to hold one
 *     whole clause rather than the tail of one and the head of the next;
 *   - comparison (F7) aligns clause to clause, and splits each into `ref` + `body` so that
 *     inserting a clause does not report every clause after it as changed (decision D7).
 *
 * Pure: text in, segments out.
 */

export interface ClauseSegment {
  /** The clause reference exactly as written: "4.2", "(a)", "Article IV", "Section 5". */
  ref: string | null;
  /** The heading line without its reference: "Limitation of Liability". */
  heading: string | null;
  /** Offsets into the text passed in — the caller shifts them if it passed a slice. */
  start: number;
  end: number;
  /** The segment's text INCLUDING its heading line. */
  text: string;
  /** The segment's text EXCLUDING the reference, which is what comparison diffs (D7). */
  body: string;
  /** Nesting depth from the reference: "4" → 1, "4.2" → 2, "4.2.1" → 3. */
  depth: number;
}

/**
 * Heading patterns, tried in order. Each must match a WHOLE line — a line is only a heading if
 * it looks like one on its own, otherwise "see clause 4.2 below" mid-sentence would split the
 * document.
 */
const HEADING_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  depthOf: (ref: string) => number;
}> = [
  {
    // "ARTICLE IV", "Article 4 - Payment"
    name: 'article',
    pattern: /^(ARTICLE|Article)\s+([IVXLCDM]+|\d+)\b[.:–—-]?\s*(.*)$/,
    depthOf: () => 1,
  },
  {
    // "SECTION 5", "Section 5.2 Payment Terms"
    name: 'section',
    pattern: /^(SECTION|Section)\s+(\d+(?:\.\d+)*)\b[.:–—-]?\s*(.*)$/,
    depthOf: (ref) => ref.split('.').length,
  },
  {
    // "4. Limitation of Liability", "4.2 Cap", "4.2.1 Exclusions"
    name: 'numbered',
    pattern: /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/,
    depthOf: (ref) => ref.split('.').length,
  },
  {
    // "(a) Each party shall...", "(iv) ..."
    name: 'lettered',
    pattern: /^\(([a-z]{1,3}|[ivxlcdm]{1,5})\)\s+(\S.*)$/,
    depthOf: () => 3,
  },
];

/** A heading line is short; a paragraph starting with a number is not a heading. */
const MAX_HEADING_LINE_LENGTH = 120;

/** An ALL-CAPS line of at least this many characters is a heading in most contracts. */
const MIN_ALLCAPS_HEADING = 4;

interface HeadingMatch {
  ref: string | null;
  heading: string | null;
  depth: number;
}

/**
 * Decides whether a line is a clause heading, and extracts its reference.
 * Exported because comparison needs exactly the same `ref` / `body` split (D7).
 */
export function matchHeading(line: string): HeadingMatch | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LINE_LENGTH) return null;

  for (const { name, pattern, depthOf } of HEADING_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (!match) continue;

    if (name === 'article' || name === 'section') {
      const ref = `${match[1]} ${match[2]}`.trim();
      const heading = (match[3] ?? '').trim();
      return { ref, heading: heading.length > 0 ? heading : null, depth: depthOf(match[2] ?? '') };
    }

    const ref = match[1] ?? '';
    const heading = (match[2] ?? '').trim();
    // A "numbered" match whose remainder is a full sentence is a numbered PARAGRAPH, not a
    // heading. Both are valid split points, so it still counts — the heading is just the text.
    return { ref, heading: heading.length > 0 ? heading : null, depth: depthOf(ref) };
  }

  // An ALL-CAPS line with no reference: "LIMITATION OF LIABILITY".
  if (isAllCapsHeading(trimmed)) {
    return { ref: null, heading: trimmed, depth: 1 };
  }

  return null;
}

export function segmentClauses(text: string): ClauseSegment[] {
  // A document with no actual characters has no clauses. Returning a single empty segment
  // would give the chunker a zero-length chunk to index.
  if (text.trim().length === 0) return [];

  const lines = splitLines(text);
  if (lines.length === 0) return [];

  // Offset of each heading line, plus what it matched.
  const boundaries: Array<{ lineIndex: number; match: HeadingMatch }> = [];
  lines.forEach((line, index) => {
    const match = matchHeading(line.text);
    if (match) boundaries.push({ lineIndex: index, match });
  });

  // No headings at all (a plain letter, or extraction that lost the structure): one segment.
  if (boundaries.length === 0) {
    return [buildSegment(text, 0, text.length, { ref: null, heading: null, depth: 1 })];
  }

  const segments: ClauseSegment[] = [];

  /**
   * Every boundary index came from iterating `lines`, so it is always in range. The lookup
   * still goes through a total function rather than a non-null assertion, so a future change
   * to how boundaries are collected degrades into a wrong offset rather than a crash.
   */
  const lineStart = (lineIndex: number): number => lines[lineIndex]?.start ?? text.length;

  // Anything before the first heading is the preamble — it holds the parties and the
  // recitals, so it must not be dropped.
  const [firstBoundary] = boundaries;
  if (firstBoundary !== undefined && firstBoundary.lineIndex > 0) {
    const preambleEnd = lineStart(firstBoundary.lineIndex);
    if (text.slice(0, preambleEnd).trim().length > 0) {
      segments.push(buildSegment(text, 0, preambleEnd, { ref: null, heading: null, depth: 1 }));
    }
  }

  boundaries.forEach((boundary, index) => {
    const start = lineStart(boundary.lineIndex);
    const next = boundaries[index + 1];
    const end = next === undefined ? text.length : lineStart(next.lineIndex);
    segments.push(buildSegment(text, start, end, boundary.match));
  });

  return segments;
}

function buildSegment(
  text: string,
  start: number,
  end: number,
  match: HeadingMatch,
): ClauseSegment {
  // Trim trailing whitespace from the range so a segment's offsets address real characters,
  // while keeping `start` where the heading actually begins.
  let trimmedEnd = end;
  while (trimmedEnd > start && /\s/.test(text[trimmedEnd - 1] ?? '')) trimmedEnd -= 1;

  const segmentText = text.slice(start, trimmedEnd);

  return {
    ref: match.ref,
    heading: match.heading,
    start,
    end: trimmedEnd,
    text: segmentText,
    body: stripLeadingRef(segmentText, match.ref),
    depth: match.depth,
  };
}

/**
 * Removes the leading clause reference from a segment's text.
 * This is the mechanism behind decision D7: comparison diffs `body`, so "1.2 Payment terms…"
 * and "1.3 Payment terms…" are identical and renumbering is invisible.
 */
export function stripLeadingRef(segmentText: string, ref: string | null): string {
  if (ref === null) return segmentText.trim();

  const trimmed = segmentText.trimStart();
  // Matches the ref followed by its separator, in any of the forms the patterns accept.
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withRef = new RegExp(`^\\(?${escaped}\\)?\\.?\\s*[.:–—-]?\\s*`);
  return trimmed.replace(withRef, '').trim();
}

function isAllCapsHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < MIN_ALLCAPS_HEADING) return false;
  if (letters !== letters.toUpperCase()) return false;
  // A long all-caps block is shouted body text, not a heading.
  return line.length <= 80 && !line.trimEnd().endsWith('.');
}

function splitLines(text: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length || text[index] === '\n') {
      if (index > start) {
        result.push({ text: text.slice(start, index), start, end: index });
      }
      start = index + 1;
    }
  }
  return result;
}
