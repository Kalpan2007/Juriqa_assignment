import { describe, expect, it } from 'vitest';
import {
  detectScanned,
  formatPageRanges,
  SCANNED_PAGE_CHAR_THRESHOLD,
} from '../domain/scanned-detector';

/** A page of real contract text is a few thousand characters. */
const TEXT_PAGE = 2_400;
/** A scanned page yields nothing, or a stray page number. */
const SCAN_PAGE = 0;

describe('detectScanned — a fully scanned PDF must never be treated as readable', () => {
  it('flags a document where every page is empty', () => {
    const verdict = detectScanned([SCAN_PAGE, SCAN_PAGE, SCAN_PAGE, SCAN_PAGE]);

    expect(verdict.isFullyScanned).toBe(true);
    expect(verdict.scannedPages).toEqual([1, 2, 3, 4]);
  });

  it('flags a scan whose pages carry only a page number', () => {
    const verdict = detectScanned([3, 3, 4, 3, 3]);

    expect(verdict.isFullyScanned).toBe(true);
    expect(verdict.scannedPages).toHaveLength(5);
  });

  it('flags a long scan even when one page happens to have text', () => {
    // 19 scanned + 1 text page: the average test passes but the 80% ratio test catches it.
    const pages = [...new Array<number>(19).fill(SCAN_PAGE), TEXT_PAGE * 20];
    const verdict = detectScanned(pages);

    expect(verdict.isFullyScanned).toBe(true);
  });

  it('treats a document with no pages as unanalysable rather than readable', () => {
    expect(detectScanned([]).isFullyScanned).toBe(true);
  });
});

describe('detectScanned — a normal text document is not a scan', () => {
  it('accepts a document of full pages', () => {
    const verdict = detectScanned(new Array<number>(150).fill(TEXT_PAGE));

    expect(verdict.isFullyScanned).toBe(false);
    expect(verdict.scannedPages).toEqual([]);
    expect(verdict.averageCharsPerPage).toBe(TEXT_PAGE);
  });

  it('accepts a document with a sparse but real page (a signature page)', () => {
    const verdict = detectScanned([TEXT_PAGE, TEXT_PAGE, 120]);

    expect(verdict.isFullyScanned).toBe(false);
    expect(verdict.scannedPages).toEqual([]);
  });
});

describe('detectScanned — the partial case, which is the one that matters', () => {
  it('stays readable but names the unreadable pages', () => {
    // A 20-page contract with scanned exhibits on pages 12-15.
    const pages = new Array<number>(20).fill(TEXT_PAGE);
    for (const page of [12, 13, 14, 15]) pages[page - 1] = SCAN_PAGE;

    const verdict = detectScanned(pages);

    expect(verdict.isFullyScanned).toBe(false);
    expect(verdict.scannedPages).toEqual([12, 13, 14, 15]);
  });

  it('reports a single unreadable page', () => {
    const pages = new Array<number>(10).fill(TEXT_PAGE);
    pages[4] = SCAN_PAGE;

    expect(detectScanned(pages).scannedPages).toEqual([5]);
  });

  it('uses the documented per-page threshold', () => {
    const justUnder = detectScanned([TEXT_PAGE, SCANNED_PAGE_CHAR_THRESHOLD - 1, TEXT_PAGE]);
    const exactly = detectScanned([TEXT_PAGE, SCANNED_PAGE_CHAR_THRESHOLD, TEXT_PAGE]);

    expect(justUnder.scannedPages).toEqual([2]);
    expect(exactly.scannedPages).toEqual([]);
  });
});

describe('formatPageRanges — the warning has to read like a person wrote it', () => {
  it('collapses consecutive pages into a range', () => {
    expect(formatPageRanges([12, 13, 14, 15])).toBe('12–15');
  });

  it('mixes ranges and single pages', () => {
    expect(formatPageRanges([3, 4, 5, 9, 14, 15])).toBe('3–5, 9, 14–15');
  });

  it('handles a single page', () => {
    expect(formatPageRanges([7])).toBe('7');
  });

  it('handles two adjacent pages', () => {
    expect(formatPageRanges([7, 8])).toBe('7–8');
  });

  it('handles two separate pages', () => {
    expect(formatPageRanges([7, 9])).toBe('7, 9');
  });

  it('sorts unordered input', () => {
    expect(formatPageRanges([15, 12, 14, 13])).toBe('12–15');
  });

  it('returns an empty string for no pages', () => {
    expect(formatPageRanges([])).toBe('');
  });

  it('does not mutate the input', () => {
    const pages = [5, 3, 4];
    formatPageRanges(pages);
    expect(pages).toEqual([5, 3, 4]);
  });
});
