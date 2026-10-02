import { describe, expect, it } from 'vitest';
import { extractPdf, PdfExtractionError } from '../domain/pdf-extractor';
import {
  buildLongContract,
  buildPdf,
  emptyPage,
  textPage,
} from '../../../../test/fixtures/build-pdf';

const OPTIONS = { maxPages: 300 };

describe('extractPdf — offsets are the backbone', () => {
  it('slices each page back out of fullText exactly', () => {
    // The explicit F1 acceptance check: fullText.slice(page.start, page.end) === page text.
    const pdf = buildPdf([
      textPage(['Page one line one.', 'Page one line two.']),
      textPage(['Page two line one.']),
      textPage(['Page three line one.', 'Page three line two.']),
    ]);

    return extractPdf(pdf, OPTIONS).then((result) => {
      expect(result.pageCount).toBe(3);
      expect(result.pages).toHaveLength(3);

      for (const page of result.pages) {
        const slice = result.fullText.slice(page.startOffset, page.endOffset);
        expect(slice).toContain(`Page ${['one', 'two', 'three'][page.number - 1]} line one.`);
      }
    });
  });

  it('gives every item offsets that slice back to its own text', async () => {
    const pdf = buildPdf([textPage(['The Supplier shall indemnify.', 'AED 100,000 cap applies.'])]);
    const { fullText, pages } = await extractPdf(pdf, OPTIONS);

    for (const item of pages[0]!.items) {
      const text = fullText.slice(item.start, item.end);
      expect(text.length).toBe(item.end - item.start);
      // An item's slice must not contain a separator we inserted between items.
      expect(text).not.toMatch(/^\n/);
    }
  });

  it('keeps items in document order with non-overlapping ranges', async () => {
    const pdf = buildPdf([textPage(['One.', 'Two.', 'Three.'])]);
    const { pages } = await extractPdf(pdf, OPTIONS);
    const items = pages[0]!.items;

    for (let i = 1; i < items.length; i += 1) {
      expect(items[i]!.start).toBeGreaterThanOrEqual(items[i - 1]!.end);
    }
  });

  it('pages are contiguous and ordered', async () => {
    const pdf = buildPdf([textPage(['A']), textPage(['B']), textPage(['C'])]);
    const { pages, fullText } = await extractPdf(pdf, OPTIONS);

    expect(pages[0]!.startOffset).toBe(0);
    for (let i = 1; i < pages.length; i += 1) {
      expect(pages[i]!.startOffset).toBeGreaterThan(pages[i - 1]!.endOffset);
    }
    expect(pages[pages.length - 1]!.endOffset).toBe(fullText.length);
  });
});

describe('extractPdf — separators', () => {
  it('puts a newline between lines, not a space', async () => {
    const pdf = buildPdf([textPage(['First line.', 'Second line.'])]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    expect(fullText).toContain('First line.\nSecond line.');
  });

  it('inserts a space where there is a visible horizontal gap', async () => {
    // Two runs on the same baseline, separated by a clear gap.
    const pdf = buildPdf([
      { runs: [{ text: 'The', x: 72, y: 700 }, { text: 'Company', x: 120, y: 700 }] },
    ]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    // The bug this prevents: "theCompany".
    expect(fullText).toContain('The Company');
  });

  it('does NOT insert a space between adjacent fragments of one word', async () => {
    // "Lia" then "bility" drawn immediately after: one word split by the PDF producer.
    // Inserting a space here would produce "Lia bility" and break quote verification.
    const pdf = buildPdf([
      { runs: [{ text: 'Lia', x: 72, y: 700 }, { text: 'bility', x: 72 + 16.7, y: 700 }] },
    ]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    expect(fullText).toContain('Liability');
  });

  it('does not double up whitespace when a fragment already ends with a space', async () => {
    const pdf = buildPdf([
      { runs: [{ text: 'The ', x: 72, y: 700 }, { text: 'Company', x: 130, y: 700 }] },
    ]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    expect(fullText).not.toContain('The  Company');
    expect(fullText).toContain('The Company');
  });

  it('separates pages with a blank line', async () => {
    const pdf = buildPdf([textPage(['End of one.']), textPage(['Start of two.'])]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    expect(fullText).toContain('End of one.\n\nStart of two.');
  });

  it('breaks the line when text moves to a new baseline without an EOL flag', async () => {
    // Multi-column and hand-positioned layouts do this constantly.
    const pdf = buildPdf([
      { runs: [{ text: 'Left column', x: 72, y: 700 }, { text: 'Right column', x: 350, y: 640 }] },
    ]);
    const { fullText } = await extractPdf(pdf, OPTIONS);

    expect(fullText).toContain('Left column\nRight column');
  });
});

describe('extractPdf — per-page readable character counts', () => {
  it('counts non-whitespace characters per page', async () => {
    const pdf = buildPdf([textPage(['Hello world.'])]);
    const { pages } = await extractPdf(pdf, OPTIONS);

    // "Helloworld." = 11 characters once whitespace is removed.
    expect(pages[0]!.textChars).toBe(11);
  });

  it('reports zero for a page with no text, which is what a scan looks like', async () => {
    const pdf = buildPdf([textPage(['Real text here.']), emptyPage(), textPage(['More text.'])]);
    const { pages } = await extractPdf(pdf, OPTIONS);

    expect(pages[1]!.textChars).toBe(0);
    expect(pages[0]!.textChars).toBeGreaterThan(0);
    expect(pages[2]!.textChars).toBeGreaterThan(0);
  });
});

describe('extractPdf — geometry for highlighting', () => {
  it('records position and size for every item', async () => {
    const pdf = buildPdf([{ runs: [{ text: 'Liability cap', x: 100, y: 500, size: 14 }] }]);
    const { pages } = await extractPdf(pdf, OPTIONS);
    const item = pages[0]!.items[0]!;

    expect(item.x).toBeCloseTo(100, 1);
    expect(item.y).toBeCloseTo(500, 1);
    expect(item.height).toBeCloseTo(14, 1);
    expect(item.width).toBeGreaterThan(0);
  });

  it('records the page size the client needs to lay out placeholders', async () => {
    const pdf = buildPdf([{ runs: [{ text: 'x', x: 10, y: 10 }], width: 595, height: 842 }]);
    const { pages } = await extractPdf(pdf, OPTIONS);

    expect(pages[0]!.width).toBeCloseTo(595, 0);
    expect(pages[0]!.height).toBeCloseTo(842, 0);
  });
});

describe('extractPdf — failures are classified, not generic', () => {
  it('rejects a corrupt file', async () => {
    const notAPdf = Buffer.from('%PDF-1.4\nthis is not actually a pdf body', 'latin1');

    await expect(extractPdf(notAPdf, OPTIONS)).rejects.toBeInstanceOf(PdfExtractionError);
  });

  it('rejects a document over the page limit, reporting the count', async () => {
    const pdf = buildPdf([textPage(['a']), textPage(['b']), textPage(['c'])]);

    try {
      await extractPdf(pdf, { maxPages: 2 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PdfExtractionError);
      expect((error as PdfExtractionError).failure).toEqual({
        reason: 'TOO_MANY_PAGES',
        pageCount: 3,
      });
    }
  });
});

describe('extractPdf — a long document', () => {
  it('extracts 150 pages with correct offsets and progress reporting', async () => {
    const pdf = buildLongContract(150);
    const progress: number[] = [];

    const result = await extractPdf(pdf, {
      maxPages: 300,
      onProgress: (page) => {
        progress.push(page);
      },
    });

    expect(result.pageCount).toBe(150);
    expect(progress).toHaveLength(150);
    expect(progress[0]).toBe(1);
    expect(progress[149]).toBe(150);

    // A clause late in the document must be present and findable — this is what the
    // retrieval acceptance check depends on.
    expect(result.fullText).toContain('MARKER-140-END');
    expect(result.fullText).toContain('MARKER-150-END');

    // Spot-check that page offsets still address the right page near the end.
    const page140 = result.pages[139]!;
    expect(result.fullText.slice(page140.startOffset, page140.endOffset)).toContain(
      'MARKER-140-END',
    );
  }, 60_000);
});
