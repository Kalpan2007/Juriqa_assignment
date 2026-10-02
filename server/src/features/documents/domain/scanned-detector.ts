/**
 * Decides whether a PDF is a scan rather than a text document (ARCHITECTURE section 4).
 *
 * The assignment calls this out specifically: a scanned PDF must NOT be saved as an empty
 * document and reported as successful. Equally important is the partial case — a contract with
 * four scanned exhibit pages in the middle is still worth analysing, but the app has to say
 * which pages it could not read, or a later "that clause isn't in the document" would be a lie.
 *
 * Pure: takes per-page character counts, returns a verdict.
 */

/** Below this, a page has no usable text — a page number or a stray artefact at most. */
export const SCANNED_PAGE_CHAR_THRESHOLD = 10;

/** A document averaging less than this across all pages is a scan. */
export const SCANNED_DOCUMENT_AVG_CHARS = 25;

/** If this share of pages are unreadable, the document is a scan even if a few pages are not. */
export const SCANNED_DOCUMENT_PAGE_RATIO = 0.8;

export interface ScanVerdict {
  /** True when the document cannot be analysed at all → FAILED / SCANNED_PDF, never READY. */
  isFullyScanned: boolean;
  /** 1-based page numbers with no readable text. Drives the warning and the coverage report. */
  scannedPages: number[];
  averageCharsPerPage: number;
}

export function detectScanned(charsPerPage: readonly number[]): ScanVerdict {
  if (charsPerPage.length === 0) {
    // No pages at all is not a scan; it is a broken file, and the caller reports that.
    return { isFullyScanned: true, scannedPages: [], averageCharsPerPage: 0 };
  }

  const scannedPages: number[] = [];
  let total = 0;

  charsPerPage.forEach((chars, index) => {
    total += chars;
    if (chars < SCANNED_PAGE_CHAR_THRESHOLD) scannedPages.push(index + 1);
  });

  const averageCharsPerPage = total / charsPerPage.length;
  const scannedRatio = scannedPages.length / charsPerPage.length;

  // Either test alone is enough: a long scan with one text page fails the ratio test, and a
  // document of near-empty pages fails the average test.
  const isFullyScanned =
    averageCharsPerPage < SCANNED_DOCUMENT_AVG_CHARS || scannedRatio >= SCANNED_DOCUMENT_PAGE_RATIO;

  return { isFullyScanned, scannedPages, averageCharsPerPage };
}

/**
 * Formats scanned page numbers as ranges for the warning banner: [12,13,14,15,40] →
 * "12–15, 40". Shown to a user, so consecutive pages must read as a range.
 */
export function formatPageRanges(pages: readonly number[]): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a - b);

  const [first, ...rest] = sorted;
  if (first === undefined) return '';

  const parts: string[] = [];
  let rangeStart = first;
  let previous = first;

  for (const page of rest) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}–${previous}`);
    rangeStart = page;
    previous = page;
  }
  parts.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}–${previous}`);

  return parts.join(', ');
}
