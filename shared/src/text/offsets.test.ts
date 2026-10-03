import { describe, expect, it } from 'vitest';
import {
  clampRange,
  compareRanges,
  intersectRanges,
  isEmptyRange,
  mergeRanges,
  rangeContains,
  rangeLength,
  rangesOverlap,
  splitRangeByPage,
} from './offsets';

describe('rangeLength / isEmptyRange', () => {
  it('measures a half-open range', () => {
    expect(rangeLength({ start: 10, end: 15 })).toBe(5);
  });

  it('treats a reversed range as empty rather than negative', () => {
    expect(rangeLength({ start: 15, end: 10 })).toBe(0);
    expect(isEmptyRange({ start: 15, end: 10 })).toBe(true);
  });
});

describe('rangesOverlap', () => {
  it('detects a real overlap', () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
  });

  it('does not treat touching ranges as overlapping', () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });

  it('is symmetric', () => {
    const a = { start: 3, end: 9 };
    const b = { start: 8, end: 12 };
    expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
  });
});

describe('intersectRanges', () => {
  it('returns the shared part', () => {
    expect(intersectRanges({ start: 0, end: 10 }, { start: 4, end: 20 })).toEqual({
      start: 4,
      end: 10,
    });
  });

  it('returns null when there is no overlap', () => {
    expect(intersectRanges({ start: 0, end: 4 }, { start: 4, end: 8 })).toBeNull();
  });
});

describe('rangeContains', () => {
  it('accepts an inner range flush with both edges', () => {
    expect(rangeContains({ start: 0, end: 10 }, { start: 0, end: 10 })).toBe(true);
  });

  it('rejects a range that spills past the end', () => {
    expect(rangeContains({ start: 0, end: 10 }, { start: 5, end: 11 })).toBe(false);
  });
});

describe('mergeRanges', () => {
  it('returns an empty array unchanged', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeRanges([{ start: 0, end: 5 }, { start: 3, end: 9 }])).toEqual([
      { start: 0, end: 9 },
    ]);
  });

  it('merges adjacent ranges, because the text is contiguous', () => {
    expect(mergeRanges([{ start: 0, end: 5 }, { start: 5, end: 9 }])).toEqual([
      { start: 0, end: 9 },
    ]);
  });

  it('keeps separate ranges separate and sorts them', () => {
    expect(mergeRanges([{ start: 20, end: 25 }, { start: 0, end: 5 }])).toEqual([
      { start: 0, end: 5 },
      { start: 20, end: 25 },
    ]);
  });

  it('does not mutate the input', () => {
    const input = [{ start: 0, end: 5 }, { start: 3, end: 9 }];
    mergeRanges(input);
    expect(input).toEqual([{ start: 0, end: 5 }, { start: 3, end: 9 }]);
  });

  it('collapses a fully contained range', () => {
    expect(mergeRanges([{ start: 0, end: 20 }, { start: 5, end: 9 }])).toEqual([
      { start: 0, end: 20 },
    ]);
  });
});

describe('clampRange', () => {
  it('clips a range that runs past the end of the text', () => {
    expect(clampRange({ start: 5, end: 500 }, 100)).toEqual({ start: 5, end: 100 });
  });

  it('returns null when the range falls entirely outside', () => {
    expect(clampRange({ start: 200, end: 300 }, 100)).toBeNull();
  });

  it('handles negative starts', () => {
    expect(clampRange({ start: -10, end: 10 }, 100)).toEqual({ start: 0, end: 10 });
  });
});

describe('compareRanges', () => {
  it('orders by start, then end', () => {
    const ranges = [
      { start: 5, end: 10 },
      { start: 0, end: 20 },
      { start: 5, end: 7 },
    ];
    expect([...ranges].sort(compareRanges)).toEqual([
      { start: 0, end: 20 },
      { start: 5, end: 7 },
      { start: 5, end: 10 },
    ]);
  });
});

describe('splitRangeByPage', () => {
  const pages = [
    { pageNumber: 1, startOffset: 0, endOffset: 100 },
    { pageNumber: 2, startOffset: 100, endOffset: 200 },
    { pageNumber: 3, startOffset: 200, endOffset: 300 },
  ];

  it('splits a quote spanning across two pages', () => {
    const result = splitRangeByPage({ start: 80, end: 150 }, pages);
    expect(result).toEqual([
      { pageNumber: 1, start: 80, end: 100 },
      { pageNumber: 2, start: 100, end: 150 },
    ]);
  });

  it('keeps a single-page quote on its page', () => {
    const result = splitRangeByPage({ start: 120, end: 180 }, pages);
    expect(result).toEqual([{ pageNumber: 2, start: 120, end: 180 }]);
  });

  it('splits a quote spanning across three pages', () => {
    const result = splitRangeByPage({ start: 50, end: 250 }, pages);
    expect(result).toEqual([
      { pageNumber: 1, start: 50, end: 100 },
      { pageNumber: 2, start: 100, end: 200 },
      { pageNumber: 3, start: 200, end: 250 },
    ]);
  });
});

