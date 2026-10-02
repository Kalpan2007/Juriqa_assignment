/**
 * Offset primitives. Every quote, highlight, page and clause points into
 * `Document.fullText` by character offset (ARCHITECTURE principle 3), so these few
 * operations are shared by the server and the browser and must behave identically.
 *
 * Ranges are half-open: `start` is inclusive, `end` is exclusive, like `String.prototype.slice`.
 */

export interface TextRange {
  start: number;
  end: number;
}

export function rangeLength(range: TextRange): number {
  return Math.max(0, range.end - range.start);
}

export function isEmptyRange(range: TextRange): boolean {
  return rangeLength(range) === 0;
}

/** True when the two ranges share at least one character. Touching ranges do not overlap. */
export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The shared part of two ranges, or null when they do not overlap. */
export function intersectRanges(a: TextRange, b: TextRange): TextRange | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

export function rangeContains(outer: TextRange, inner: TextRange): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/** Sorts by start, then by end — the canonical order for rendering overlays. */
export function compareRanges(a: TextRange, b: TextRange): number {
  return a.start - b.start || a.end - b.end;
}

/**
 * Merges overlapping and adjacent ranges into the smallest equivalent set.
 * Used when one quote produces several item-level ranges on the same line.
 */
export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort(compareRanges);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    // Adjacent ranges (last.end === range.start) are merged too: they are contiguous text.
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Clamps a range into `[0, length]`, returning null when nothing is left.
 * Guards against an offset computed against a different version of the text.
 */
export function clampRange(range: TextRange, length: number): TextRange | null {
  const start = Math.min(Math.max(range.start, 0), length);
  const end = Math.min(Math.max(range.end, 0), length);
  return start < end ? { start, end } : null;
}
