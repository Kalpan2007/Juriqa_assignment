import { describe, expect, it } from 'vitest';
import {
  boilerplateOverlapRatio,
  detectBoilerplate,
  normalizeBoilerplateLine,
  normalizePageMarker,
  type PageLines,
} from '../domain/boilerplate-detector';

/**
 * Builds pages from line arrays, assigning real offsets the way the extractor would, so the
 * returned ranges can be sliced back out of the reconstructed text.
 */
function buildPages(pageLines: string[][]): { pages: PageLines[]; fullText: string } {
  let offset = 0;
  let fullText = '';
  const pages: PageLines[] = [];

  pageLines.forEach((lines, pageIndex) => {
    if (pageIndex > 0) {
      fullText += '\n\n';
      offset += 2;
    }
    const built = lines.map((text, lineIndex) => {
      if (lineIndex > 0) {
        fullText += '\n';
        offset += 1;
      }
      const start = offset;
      fullText += text;
      offset += text.length;
      return { text, start, end: offset };
    });
    pages.push({ lines: built });
  });

  return { pages, fullText };
}

describe('normalizeBoilerplateLine — exact comparison, no masking', () => {
  it('is case and whitespace insensitive', () => {
    expect(normalizeBoilerplateLine('CONFIDENTIAL   DRAFT')).toBe(
      normalizeBoilerplateLine('Confidential Draft'),
    );
  });

  it('collapses non-breaking spaces', () => {
    expect(normalizeBoilerplateLine('Page 1')).toBe('page 1');
  });

  it('does NOT mask digits, so clause headings stay distinct', () => {
    expect(normalizeBoilerplateLine('5. Term')).not.toBe(normalizeBoilerplateLine('6. Term'));
  });
});

describe('normalizePageMarker — masking, but only where it is safe', () => {
  it('makes "Page 3 of 150" and "Page 4 of 150" the same pattern', () => {
    // Without this a page footer never repeats and is never detected.
    expect(normalizePageMarker('Page 3 of 150')).toBe(normalizePageMarker('Page 4 of 150'));
    expect(normalizePageMarker('Page 3 of 150')).toBe('page # of #');
  });

  it('accepts a bare page number and dash forms', () => {
    expect(normalizePageMarker('- 42 -')).toBe('- # -');
    expect(normalizePageMarker('7')).toBe('#');
    expect(normalizePageMarker('Page 7')).toBe('page #');
  });

  it('refuses a line carrying real words, which is what protects clause headings', () => {
    expect(normalizePageMarker('5. Term and Termination')).toBeNull();
    expect(normalizePageMarker('Clause 1 body text that differs on every page.')).toBeNull();
    expect(normalizePageMarker('The cap is AED 100,000 per claim')).toBeNull();
  });

  it('refuses a line with no digits at all', () => {
    expect(normalizePageMarker('CONFIDENTIAL')).toBeNull();
  });

  it('refuses an empty line', () => {
    expect(normalizePageMarker('   ')).toBeNull();
  });
});

describe('detectBoilerplate', () => {
  it('finds a running footer across many pages', () => {
    const { pages, fullText } = buildPages(
      Array.from({ length: 10 }, (_, i) => [
        `Clause ${i + 1} body text that differs on every page.`,
        `Page ${i + 1} of 10`,
      ]),
    );

    const result = detectBoilerplate(pages);

    expect(result.patterns).toContain('page # of #');
    expect(result.ranges).toHaveLength(10);
    // Every reported range must slice back to the footer, not to body text.
    for (const range of result.ranges) {
      expect(fullText.slice(range.start, range.end)).toMatch(/^Page \d+ of 10$/);
    }
  });

  it('finds a running header and a footer together', () => {
    const { pages } = buildPages(
      Array.from({ length: 8 }, (_, i) => [
        'CONFIDENTIAL - DRAFT',
        `Unique body for page ${i + 1}.`,
        `- ${i + 1} -`,
      ]),
    );

    const result = detectBoilerplate(pages);

    expect(result.patterns).toContain('confidential - draft');
    expect(result.patterns).toContain('- # -');
    expect(result.ranges).toHaveLength(16);
  });

  it('leaves real body text alone', () => {
    const { pages } = buildPages(
      Array.from({ length: 10 }, (_, i) => [
        `The Supplier shall indemnify the Customer, clause ${i + 1}.`,
        `Governing law provision variant ${i + 1}.`,
      ]),
    );

    expect(detectBoilerplate(pages).ranges).toEqual([]);
  });

  it('ignores a line that repeats on only half the pages or fewer', () => {
    // Strictly MORE than 50% is required, so exactly half must not qualify.
    const { pages } = buildPages(
      Array.from({ length: 10 }, (_, i) => [
        i < 5 ? 'EXHIBIT A' : `Body ${i}`,
        `Unique tail ${i}`,
      ]),
    );

    expect(detectBoilerplate(pages).patterns).not.toContain('exhibit a');
  });

  it('does nothing for a short document, where repetition means nothing', () => {
    const { pages } = buildPages([
      ['Mutual Non-Disclosure Agreement', 'Body one'],
      ['Mutual Non-Disclosure Agreement', 'Body two'],
    ]);

    expect(detectBoilerplate(pages).ranges).toEqual([]);
  });

  it('only looks at the edges of a page, not its middle', () => {
    // The same sentence recurring mid-page is a defined term or a cross-reference, not a header.
    const { pages } = buildPages(
      Array.from({ length: 10 }, (_, i) => [
        `Head ${i}`,
        'filler',
        'filler',
        'as defined in Section 4.2',
        'filler',
        'filler',
        `Tail ${i}`,
      ]),
    );

    expect(detectBoilerplate(pages).patterns).not.toContain('as defined in section #.#');
  });

  it('ignores a long repeated line, which is body text rather than a header', () => {
    const longLine = 'This agreement is governed by the laws of the DIFC and '.repeat(4);
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
    const { pages } = buildPages(words.map((word) => [longLine, `Body text about ${word}.`]));

    expect(detectBoilerplate(pages).ranges).toEqual([]);
  });

  it('does NOT treat numbered clause headings as boilerplate', () => {
    /**
     * The regression that masking digits everywhere caused: "5. Term" and "6. Notices" both
     * reduce to a "#. word" shape, so every numbered clause heading at a page edge looked like
     * a running header — and real contract text would have been excluded from search.
     */
    const headings = [
      '5. Term',
      '6. Notices',
      '7. Fees',
      '8. Audit',
      '9. Waiver',
      '10. Set-off',
      '11. Costs',
      '12. Survival',
    ];
    const { pages } = buildPages(headings.map((heading, i) => [heading, `Body of clause ${i}.`]));

    const result = detectBoilerplate(pages);

    expect(result.ranges).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it('still detects a page footer alongside numbered headings', () => {
    // Both behaviours at once: the footer is found, the headings are left alone.
    const headings = ['5. Term', '6. Notices', '7. Fees', '8. Audit', '9. Waiver', '10. Set-off'];
    const { pages, fullText } = buildPages(
      headings.map((heading, i) => [heading, `Body ${i} differs.`, `Page ${i + 5} of 40`]),
    );

    const result = detectBoilerplate(pages);

    expect(result.patterns).toContain('page # of #');
    expect(result.ranges).toHaveLength(headings.length);
    for (const range of result.ranges) {
      expect(fullText.slice(range.start, range.end)).toMatch(/^Page \d+ of 40$/);
    }
  });

  it('returns ranges in document order', () => {
    const { pages } = buildPages(
      Array.from({ length: 6 }, (_, i) => ['HEADER', `Body ${i}`, 'FOOTER']),
    );

    const starts = detectBoilerplate(pages).ranges.map((r) => r.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('boilerplateOverlapRatio', () => {
  const boilerplate = [
    { start: 0, end: 10 },
    { start: 100, end: 120 },
  ];

  it('is 1 when the range is entirely boilerplate', () => {
    expect(boilerplateOverlapRatio({ start: 0, end: 10 }, boilerplate)).toBe(1);
  });

  it('is 0 when the range does not touch boilerplate', () => {
    expect(boilerplateOverlapRatio({ start: 20, end: 90 }, boilerplate)).toBe(0);
  });

  it('is a small fraction when a header is swallowed by a large chunk', () => {
    // This is why the chunker uses a ratio: an 800-token clause containing one header line
    // must not be discarded as boilerplate.
    const ratio = boilerplateOverlapRatio({ start: 0, end: 1000 }, boilerplate);
    expect(ratio).toBeCloseTo(0.03, 2);
  });

  it('sums several overlapping boilerplate ranges', () => {
    expect(boilerplateOverlapRatio({ start: 0, end: 120 }, boilerplate)).toBeCloseTo(30 / 120, 5);
  });

  it('is 0 for an empty range', () => {
    expect(boilerplateOverlapRatio({ start: 50, end: 50 }, boilerplate)).toBe(0);
  });
});
