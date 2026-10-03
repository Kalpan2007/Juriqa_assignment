import type { TextRange } from '@ca/shared';

export interface ItemGeometry {
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Computes CSS pixel highlight rectangles for a quote match on a specific PDF page.
 *
 * Handles:
 * - multi-line quotes (spanning multiple items)
 * - partial-item quotes (where the quote starts or ends mid-word or mid-phrase)
 * - zoom scaling
 * - PDF coordinate system (origin bottom-left converted to screen top-left)
 */
export function computeHighlightRects(
  range: TextRange,
  items: readonly ItemGeometry[],
  pageHeight: number,
  scale = 1.0,
): HighlightRect[] {
  const rects: HighlightRect[] = [];

  for (const item of items) {
    // Check if the item overlaps the requested range
    if (item.start >= range.end || item.end <= range.start) {
      continue;
    }

    const itemLen = item.end - item.start;
    if (itemLen <= 0) continue;

    // Local slice inside this item
    const sliceStart = Math.max(0, range.start - item.start);
    const sliceEnd = Math.min(itemLen, range.end - item.start);
    if (sliceStart >= sliceEnd) continue;

    const fractionLeft = sliceStart / itemLen;
    const fractionWidth = (sliceEnd - sliceStart) / itemLen;

    const rectLeft = (item.x + item.width * fractionLeft) * scale;
    // In PDF space, item.y is distance from the bottom edge
    const rectTop = (pageHeight - (item.y + item.height)) * scale;
    const rectWidth = (item.width * fractionWidth) * scale;
    const rectHeight = item.height * scale;

    rects.push({
      left: Math.max(0, rectLeft),
      top: Math.max(0, rectTop),
      width: Math.max(2, rectWidth),
      height: Math.max(2, rectHeight),
    });
  }

  return rects;
}
