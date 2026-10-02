/**
 * Finds the running headers and footers of a PDF (ARCHITECTURE section 4).
 *
 * Why bother: in a 150-page credit agreement, "CONFIDENTIAL — DRAFT 14 MARCH 2024" and
 * "Page 42 of 150" each appear 150 times. Left alone they outrank real clauses in full-text
 * search, and in a version comparison they generate 150 spurious "changes" when a page break
 * moves. So they are detected and excluded from retrieval and comparison.
 *
 * Critically, `fullText` is NEVER modified — every offset in the system points into it, so
 * deleting text would invalidate every stored quote match. Boilerplate is recorded as RANGES.
 *
 * Pure: takes the lines of each page, returns offset ranges.
 */

/** Lines this far into the top/bottom of a page are candidates. */
const EDGE_LINES = 3;

/** A line must repeat on more than this share of pages to count as boilerplate. */
const REPEAT_RATIO = 0.5;

/** Below this many pages, repetition means nothing. */
const MIN_PAGES = 4;

/** A long line is body text that happens to recur, not a header. */
const MAX_BOILERPLATE_LINE_LENGTH = 120;

export interface PageLines {
  /** Lines in document order, each with its absolute offsets into `fullText`. */
  lines: ReadonlyArray<{ text: string; start: number; end: number }>;
}

export interface BoilerplateResult {
  /** Offset ranges of lines identified as running headers or footers. */
  ranges: Array<{ start: number; end: number }>;
  /** The normalised forms that were flagged — useful for logging and explaining a decision. */
  patterns: string[];
}

/**
 * Longest run of letters a line may have and still be treated as a page marker.
 *
 * This limit is what keeps digit masking safe. Masking digits is necessary — otherwise
 * "Page 3 of 150" and "Page 4 of 150" are different strings and no footer is ever detected.
 * But applied to every line it is actively harmful: "5. Term" and "6. Notices" both become
 * "#. term"-shaped, and numbered CLAUSE HEADINGS start looking like running headers, which
 * would exclude real contract text from search. So masking is only applied to lines that are
 * almost entirely digits and punctuation — "Page # of #" (6 letters), "- # -" (0 letters) —
 * and never to lines carrying actual words.
 */
const MAX_PAGE_MARKER_LETTERS = 10;

/**
 * Normalises a line for exact comparison: case and whitespace only.
 * Digits are NOT masked here — see `normalizePageMarker`.
 */
export function normalizeBoilerplateLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/**
 * Normalises a page marker, masking digit runs, or returns null when the line carries too
 * many letters to be a page marker.
 */
export function normalizePageMarker(text: string): string | null {
  const normalized = normalizeBoilerplateLine(text);
  if (normalized.length === 0) return null;

  const letters = normalized.replace(/[^a-z]/g, '');
  if (letters.length > MAX_PAGE_MARKER_LETTERS) return null;
  // Must actually contain a number, or it is not a page marker.
  if (!/\d/.test(normalized)) return null;

  return normalized.replace(/\d+/g, '#');
}

export function detectBoilerplate(pages: readonly PageLines[]): BoilerplateResult {
  if (pages.length < MIN_PAGES) {
    return { ranges: [], patterns: [] };
  }

  /**
   * Two independent passes, because the two kinds of running line behave differently:
   *   - exact: "CONFIDENTIAL — DRAFT", identical on every page;
   *   - page marker: "Page 3 of 150", identical only once the digits are masked.
   * Keeping them separate is what lets masking be used where it is needed without letting it
   * loose on lines that contain real words.
   *
   * Pages are counted as a SET: a line repeated three times on one page is not boilerplate.
   */
  const exactPages = new Map<string, Set<number>>();
  const markerPages = new Map<string, Set<number>>();

  pages.forEach((page, pageIndex) => {
    for (const line of edgeLines(page)) {
      const exact = normalizeBoilerplateLine(line.text);
      if (isCandidate(exact)) {
        record(exactPages, exact, pageIndex);
      }
      const marker = normalizePageMarker(line.text);
      if (marker !== null && isCandidate(marker)) {
        record(markerPages, marker, pageIndex);
      }
    }
  });

  const threshold = pages.length * REPEAT_RATIO;
  const exactPatterns = patternsOver(exactPages, threshold);
  const markerPatterns = patternsOver(markerPages, threshold);

  const ranges: Array<{ start: number; end: number }> = [];
  for (const page of pages) {
    for (const line of edgeLines(page)) {
      const marker = normalizePageMarker(line.text);
      const isBoilerplate =
        exactPatterns.has(normalizeBoilerplateLine(line.text)) ||
        (marker !== null && markerPatterns.has(marker));
      if (isBoilerplate) {
        ranges.push({ start: line.start, end: line.end });
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return { ranges, patterns: [...exactPatterns, ...markerPatterns] };
}

function record(map: Map<string, Set<number>>, key: string, pageIndex: number): void {
  const seen = map.get(key) ?? new Set<number>();
  seen.add(pageIndex);
  map.set(key, seen);
}

function patternsOver(map: Map<string, Set<number>>, threshold: number): Set<string> {
  const result = new Set<string>();
  for (const [pattern, pageSet] of map) {
    if (pageSet.size > threshold) result.add(pattern);
  }
  return result;
}

/**
 * Share of a text range that falls inside boilerplate. The chunker uses this: a chunk is
 * marked boilerplate only when it is MOSTLY boilerplate, because a header line swallowed by
 * an 800-token chunk must not disqualify the real clause around it.
 */
export function boilerplateOverlapRatio(
  range: { start: number; end: number },
  boilerplateRanges: ReadonlyArray<{ start: number; end: number }>,
): number {
  const length = range.end - range.start;
  if (length <= 0) return 0;

  let covered = 0;
  for (const boilerplate of boilerplateRanges) {
    const start = Math.max(range.start, boilerplate.start);
    const end = Math.min(range.end, boilerplate.end);
    if (start < end) covered += end - start;
  }
  return covered / length;
}

function edgeLines(page: PageLines): Array<{ text: string; start: number; end: number }> {
  const { lines } = page;
  if (lines.length <= EDGE_LINES * 2) return [...lines];
  return [...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)];
}

function isCandidate(pattern: string): boolean {
  if (pattern.length === 0) return false;
  if (pattern.length > MAX_BOILERPLATE_LINE_LENGTH) return false;
  // A line of only masked digits and punctuation ("#", "- # -") is a bare page number.
  return true;
}
