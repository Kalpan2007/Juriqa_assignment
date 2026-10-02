import { beforeAll, describe, expect, it } from 'vitest';
import { extractPdf } from '../../documents/domain/pdf-extractor';
import { extractDocx } from '../../documents/domain/docx-extractor';
import { findQuote, prepareDocument, type PreparedDocument } from '../domain/quote-finder';
import { buildLongContract } from '../../../../test/fixtures/build-pdf';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verification against text that came out of a REAL extraction, not a hand-written string.
 *
 * The unit tests use literals, which means they test the matcher against text I chose. This
 * suite closes that gap: the document text here is whatever pdf.js and mammoth actually
 * produced, including the separators the extractor inserted. A quote is then copied out of
 * it and deliberately re-wrapped across lines, which is exactly what happens when a model
 * quotes from an excerpt it was given.
 */
describe('verification against a real extracted PDF', () => {
  let fullText: string;
  let document: PreparedDocument;

  beforeAll(async () => {
    const extraction = await extractPdf(buildLongContract(150), { maxPages: 300 });
    fullText = extraction.fullText;
    document = prepareDocument(fullText);
  }, 120_000);

  /**
   * Takes real text out of the document, snapped to word boundaries.
   *
   * Snapping matters: slicing by character count cuts mid-word, which makes a quote that is
   * genuinely present look like a fragment and makes "change one word" tests silently
   * tamper with nothing.
   */
  function excerptAround(marker: string, before: number, after: number): string {
    const index = fullText.indexOf(marker);
    expect(index, `marker ${marker} not in the extracted text`).toBeGreaterThan(-1);

    let start = Math.max(0, index - before);
    while (start > 0 && /\S/.test(fullText[start - 1] ?? '')) start -= 1;

    let end = Math.min(fullText.length, index + marker.length + after);
    while (end < fullText.length && /\S/.test(fullText[end] ?? '')) end += 1;

    return fullText.slice(start, end);
  }

  /** The whole generated sentence for a page, which is known to contain specific words. */
  function sentenceForPage(page: number): string {
    const sentence = `This clause ${page} states that the parties shall perform their obligations.`;
    expect(fullText.replace(/\s+/g, ' ')).toContain(sentence);
    return sentence;
  }

  it('finds an excerpt from early in the document', () => {
    const excerpt = excerptAround('MARKER-3-END', 60, 0);
    const result = findQuote(document, excerpt);

    expect(result.found).toBe(true);
  });

  it('finds an excerpt from the middle', () => {
    const excerpt = excerptAround('MARKER-75-END', 60, 0);
    expect(findQuote(document, excerpt).found).toBe(true);
  });

  it('finds an excerpt from page ~140, deep in the document', () => {
    const excerpt = excerptAround('MARKER-140-END', 60, 0);
    const result = findQuote(document, excerpt);

    expect(result.found).toBe(true);
    if (!result.found) return;
    // The offsets must address the real text, which is what the highlight depends on.
    const match = result.matches[0]!;
    expect(fullText.slice(match.start, match.end)).toContain('MARKER-140-END');
  });

  it('finds an excerpt that has been re-wrapped across lines', () => {
    /**
     * The real-world case: the model received an excerpt, wrapped it in its own output, and
     * quoted it back with different line breaks. The words are identical, so this MUST match
     * — if it did not, genuine quotes would routinely show as unverified.
     */
    const original = sentenceForPage(120);
    // Re-wrap at every third space, which is a different wrapping from the document's.
    let spaceCount = 0;
    const rewrapped = original.replace(/ /g, () => {
      spaceCount += 1;
      return spaceCount % 3 === 0 ? '\n   ' : ' ';
    });

    expect(rewrapped).not.toBe(original);
    expect(rewrapped).toContain('\n');
    expect(findQuote(document, rewrapped).found).toBe(true);
  });

  it('finds an excerpt squeezed onto one line', () => {
    const multiLine = excerptAround('MARKER-88-END', 90, 20);
    expect(multiLine).toContain('\n');

    const oneLine = multiLine.replace(/\s+/g, ' ').trim();
    expect(findQuote(document, oneLine).found).toBe(true);
  });

  it('finds a quote spanning a page break in the extracted text', () => {
    // Pages are joined with a blank line, so this crosses that boundary.
    const pageBreak = fullText.indexOf('\n\n', fullText.indexOf('MARKER-50-END'));
    expect(pageBreak).toBeGreaterThan(-1);
    const spanning = fullText.slice(pageBreak - 40, pageBreak + 40);

    expect(spanning).toContain('\n\n');
    expect(findQuote(document, spanning).found).toBe(true);
  });

  it('rejects an invented clause that is not in the document', () => {
    expect(
      findQuote(document, 'The Supplier shall maintain insurance of AED 9,999,999 at all times.')
        .found,
    ).toBe(false);
  });

  it('rejects a real excerpt with a single word changed', () => {
    const excerpt = sentenceForPage(30);
    // "shall" → "may" turns an obligation into a discretion.
    const tampered = excerpt.replace('shall perform', 'may perform');

    expect(tampered).not.toBe(excerpt);
    expect(findQuote(document, excerpt).found).toBe(true);
    expect(findQuote(document, tampered).found).toBe(false);
  });

  it('rejects a real excerpt with a changed number', () => {
    const excerpt = sentenceForPage(45);
    // Re-attributes the clause to a different one in the same document.
    const tampered = excerpt.replace('clause 45', 'clause 46');

    expect(tampered).not.toBe(excerpt);
    expect(findQuote(document, excerpt).found).toBe(true);
    expect(findQuote(document, tampered).found).toBe(true);

    // That one DOES exist elsewhere, so a stronger check: an amount that exists nowhere.
    const invented = excerpt.replace('their obligations', 'obligations up to AED 7,777,777');
    expect(findQuote(document, invented).found).toBe(false);
  });
});

describe('verification against a real extracted DOCX', () => {
  let fullText: string;
  let document: PreparedDocument;

  beforeAll(async () => {
    const fixture = path.resolve(__dirname, '../../../../test/fixtures/contract.docx');
    const extraction = await extractDocx(fs.readFileSync(fixture));
    fullText = extraction.fullText;
    document = prepareDocument(fullText);
  }, 60_000);

  it('finds a sentence that was split across runs by bold formatting', () => {
    /**
     * In the .docx this sentence is three runs — plain, bold "AED 100,000", plain. If the
     * extractor joined them wrongly, or the matcher could not cope, the single most quotable
     * sentence in the contract would be unverifiable.
     */
    const result = findQuote(
      document,
      'The total liability shall not exceed AED 100,000 in aggregate.',
    );

    expect(result.found).toBe(true);
    if (!result.found) return;
    const match = result.matches[0]!;
    expect(fullText.slice(match.start, match.end)).toContain('AED 100,000');
  });

  it('finds text that crosses a block boundary', () => {
    // Blocks are joined with a newline, so this spans two paragraphs.
    expect(findQuote(document, '1. Definitions In this Agreement the following terms apply.').found).toBe(
      true,
    );
  });

  it('finds text from inside a table cell', () => {
    expect(findQuote(document, 'Consulting AED 5,000').found).toBe(true);
  });

  it('finds a sentence whose hyperlink text was inlined', () => {
    expect(findQuote(document, 'Governed by DIFC law. See the DIFC courts for details.').found).toBe(
      true,
    );
  });

  it('rejects a changed amount', () => {
    expect(
      findQuote(document, 'The total liability shall not exceed AED 500,000 in aggregate.').found,
    ).toBe(false);
  });
});
