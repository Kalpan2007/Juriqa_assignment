import { describe, expect, it } from 'vitest';
import { computeHighlightRects } from '../highlight-geometry';

describe('computeHighlightRects', () => {
  const pageHeight = 800;
  const items = [
    { start: 0, end: 10, x: 50, y: 700, width: 100, height: 20 },
    { start: 10, end: 20, x: 50, y: 670, width: 100, height: 20 },
  ];

  it('computes exact box for full item overlap', () => {
    const rects = computeHighlightRects({ start: 0, end: 10 }, items, pageHeight, 1.0);
    expect(rects).toHaveLength(1);
    // top = 800 - (700 + 20) = 80
    expect(rects[0]).toEqual({
      left: 50,
      top: 80,
      width: 100,
      height: 20,
    });
  });

  it('computes partial slice when range starts and ends mid-item', () => {
    // 5 to 15 covers half of item 0 and half of item 1
    const rects = computeHighlightRects({ start: 5, end: 15 }, items, pageHeight, 1.0);
    expect(rects).toHaveLength(2);

    // item 0: fractionLeft = 5/10 = 0.5, fractionWidth = 5/10 = 0.5
    expect(rects[0]).toEqual({
      left: 100,
      top: 80,
      width: 50,
      height: 20,
    });

    // item 1: slice 0..5: fractionLeft = 0, fractionWidth = 0.5
    // top = 800 - (670 + 20) = 110
    expect(rects[1]).toEqual({
      left: 50,
      top: 110,
      width: 50,
      height: 20,
    });
  });

  it('applies scale factor correctly', () => {
    const rects = computeHighlightRects({ start: 0, end: 10 }, items, pageHeight, 1.5);
    expect(rects[0]).toEqual({
      left: 75,
      top: 120,
      width: 150,
      height: 30,
    });
  });
});
