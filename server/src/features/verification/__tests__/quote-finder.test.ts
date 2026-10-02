import { describe, expect, it } from 'vitest';
import {
  cleanQuote,
  findQuote,
  MAX_QUOTE_CHARS,
  prepareDocument,
} from '../domain/quote-finder';

/**
 * The verification engine (ARCHITECTURE section 5).
 *
 * Structured around the one question that matters: does this forgive EXTRACTION NOISE while
 * rejecting PARAPHRASE? Every "✓" case is an artefact of reading a PDF — the document says
 * the same thing. Every "✗" case changes what the document says, and must be rejected even
 * though a fuzzy matcher would happily accept it.
 */

/** Finds a quote and asserts it was found, returning the result for further assertions. */
function expectFound(documentText: string, quote: string) {
  const result = findQuote(prepareDocument(documentText), quote);
  expect(result.found, `expected to find: ${quote}`).toBe(true);
  if (!result.found) throw new Error('unreachable');
  return result;
}

function expectNotFound(documentText: string, quote: string) {
  const result = findQuote(prepareDocument(documentText), quote);
  expect(result.found, `expected NOT to find: ${quote}`).toBe(false);
  if (result.found) throw new Error('unreachable');
  return result;
}

/** Asserts the reported offsets actually address the quote in the original text. */
function expectOffsetsAddressTheText(documentText: string, quote: string) {
  const result = expectFound(documentText, quote);
  for (const match of result.matches) {
    const slice = documentText.slice(match.start, match.end);
    // The slice must contain the quote's words once whitespace is normalised.
    const flat = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
    expect(flat(slice)).toContain(flat(quote).slice(0, 30));
  }
  return result;
}

const CONTRACT = [
  'SERVICES AGREEMENT',
  '',
  'This Agreement is made between Alpha FZ-LLC and Beta DMCC.',
  '',
  '1. Limitation of Liability',
  'The total liability of the Supplier shall not exceed AED 100,000 in aggregate.',
  '',
  '2. Governing Law',
  'This Agreement is governed by the laws of the DIFC.',
].join('\n');

describe('a genuine quote is found', () => {
  it('matches text copied exactly', () => {
    const result = expectFound(CONTRACT, 'The total liability of the Supplier shall not exceed AED 100,000 in aggregate.');
    expect(result.kind).toBe('EXACT_WS');
  });

  it('reports offsets that slice back to the quote', () => {
    const result = expectOffsetsAddressTheText(CONTRACT, 'shall not exceed AED 100,000');
    const match = result.matches[0]!;
    expect(CONTRACT.slice(match.start, match.end)).toBe('shall not exceed AED 100,000');
  });

  it('never uses a position the model claims', () => {
    // There is no API to pass one in — that is the design. The offsets come from the search.
    const result = expectFound(CONTRACT, 'governed by the laws of the DIFC');
    expect(result.matches[0]!.start).toBe(CONTRACT.indexOf('governed by the laws'));
  });
});

describe('extraction noise is forgiven', () => {
  it('extra spaces between words', () => {
    expect(expectFound(CONTRACT, 'The  total   liability  of the Supplier').kind).toBe('EXACT_WS');
  });

  it('a line break in the middle of the quote', () => {
    expectFound(CONTRACT, 'shall not exceed\nAED 100,000');
  });

  it('a quote that spans a paragraph break in the document', () => {
    expectFound(CONTRACT, '1. Limitation of Liability The total liability');
  });

  it('a tab instead of a space', () => {
    expectFound(CONTRACT, 'The total\tliability of the Supplier');
  });

  it('curly quotation marks where the document has straight ones', () => {
    const document = 'The "Services" means the services described in Schedule 1.';
    expectFound(document, 'The “Services” means the services described');
  });

  it('straight quotation marks where the document has curly ones', () => {
    const document = 'The “Services” means the services described in Schedule 1.';
    expectFound(document, 'The "Services" means the services described');
  });

  it('an en dash where the document has a hyphen', () => {
    const document = 'The term is 12-24 months from the start date.';
    expectFound(document, 'The term is 12–24 months');
  });

  it('an em dash where the document has a hyphen', () => {
    const document = 'Payment is due 30-45 days after invoice.';
    expectFound(document, 'Payment is due 30—45 days');
  });

  it('a non-breaking space', () => {
    const document = 'The cap is AED 100,000 per claim.';
    expectFound(document, 'The cap is AED 100,000 per claim.');
  });

  it('a ligature in the document', () => {
    // PDF producers emit ﬁ as a single glyph; NFKC resolves it to "fi".
    const document = 'The Supplier shall provide a ﬁnal invoice within 30 days.';
    expectFound(document, 'shall provide a final invoice within 30 days');
  });

  it('a soft hyphen inside a word', () => {
    const document = 'The lia­bility of the Supplier is capped.';
    expectFound(document, 'The liability of the Supplier is capped.');
  });

  it('a zero-width space inside a word', () => {
    const document = 'The Sup​plier shall indemnify the Customer.';
    expectFound(document, 'The Supplier shall indemnify the Customer.');
  });

  it('a word hyphenated across a line break', () => {
    const document = 'The total liabil-\nity of the Supplier shall not exceed the cap.';
    const result = expectFound(document, 'The total liability of the Supplier');
    expect(result.kind).toBe('HYPHEN_BREAK');
  });

  it('words glued together by extraction', () => {
    // "theCompany" is the classic PDF extraction failure.
    const document = 'Each party shall indemnify theCompany against all claims.';
    const result = expectFound(document, 'shall indemnify the Company against all claims');
    expect(result.kind).toBe('WS_INSENSITIVE');
  });

  it('a word split apart by extraction', () => {
    const document = 'The Sup plier shall deliver the Services promptly.';
    const result = expectFound(document, 'The Supplier shall deliver the Services promptly.');
    expect(result.kind).toBe('WS_INSENSITIVE');
  });

  it('a quote crossing a page break', () => {
    // Pages are separated by a blank line in fullText.
    const document = 'The Supplier shall not be liable for\n\nany indirect or consequential loss.';
    expectFound(document, 'shall not be liable for any indirect or consequential loss');
  });

  it('leading and trailing whitespace on the quote', () => {
    expectFound(CONTRACT, '   governed by the laws of the DIFC   ');
  });

  it('surrounding quotation marks the model added', () => {
    expectFound(CONTRACT, '"governed by the laws of the DIFC"');
    expectFound(CONTRACT, '“governed by the laws of the DIFC”');
  });

  it('a leading or trailing ellipsis the model added', () => {
    expectFound(CONTRACT, '...shall not exceed AED 100,000 in aggregate.');
    expectFound(CONTRACT, 'The total liability of the Supplier...');
    expectFound(CONTRACT, '…shall not exceed AED 100,000…');
  });
});

describe('only the capitalisation differs (decision D6)', () => {
  it('is found, and says so', () => {
    /**
     * A model quoting from mid-sentence routinely capitalises the first word. The words are
     * identical, so rejecting it would show a GENUINE quote as unverified — the UI shows a
     * note instead.
     */
    const result = expectFound(CONTRACT, 'The Total Liability of the Supplier shall not exceed AED 100,000');
    expect(result.kind).toBe('CASE_INSENSITIVE');
  });

  it('still reports offsets into the document’s own text', () => {
    const result = expectFound(CONTRACT, 'GOVERNED BY THE LAWS OF THE DIFC');
    const match = result.matches[0]!;
    // The highlight shows the document's casing, not the model's.
    expect(CONTRACT.slice(match.start, match.end)).toBe('governed by the laws of the DIFC');
  });

  it('prefers an exact match when one exists', () => {
    const result = expectFound(CONTRACT, 'governed by the laws of the DIFC');
    expect(result.kind).toBe('EXACT_WS');
  });
});

describe('a paraphrase is rejected', () => {
  it('rejects a reworded sentence', () => {
    expect(
      expectNotFound(CONTRACT, 'The liability of the Supplier is limited to AED 100,000 overall.')
        .reason,
    ).toBe('NOT_FOUND');
  });

  it('rejects one changed word', () => {
    // "Customer" for "Supplier" is a different obligation entirely.
    expectNotFound(CONTRACT, 'The total liability of the Customer shall not exceed AED 100,000');
  });

  it('rejects a changed number', () => {
    // The difference between AED 100,000 and AED 1,000,000.
    expectNotFound(CONTRACT, 'shall not exceed AED 1,000,000 in aggregate');
  });

  it('rejects an added word', () => {
    expectNotFound(CONTRACT, 'The total aggregate liability of the Supplier shall not exceed');
  });

  it('rejects a dropped word', () => {
    expectNotFound(CONTRACT, 'The total liability of Supplier shall not exceed AED 100,000');
  });

  it('rejects reordered words', () => {
    expectNotFound(CONTRACT, 'of the Supplier the total liability shall not exceed');
  });

  it('rejects a summary', () => {
    expectNotFound(CONTRACT, 'Liability is capped and DIFC law applies.');
  });

  it('rejects an invented sentence that sounds plausible', () => {
    expectNotFound(
      CONTRACT,
      'The Supplier shall maintain professional indemnity insurance of AED 5,000,000.',
    );
  });

  it('rejects a quote from a different document', () => {
    const other = 'This Lease is governed by the laws of the Emirate of Dubai.';
    expectNotFound(CONTRACT, other);
  });
});

describe('quotes that cannot be evidence are rejected', () => {
  it('rejects a quote that is too short to mean anything', () => {
    expect(expectNotFound(CONTRACT, 'the').reason).toBe('TOO_SHORT');
    expect(expectNotFound(CONTRACT, 'AED').reason).toBe('TOO_SHORT');
  });

  it('rejects an empty quote', () => {
    expect(expectNotFound(CONTRACT, '').reason).toBe('TOO_SHORT');
    expect(expectNotFound(CONTRACT, '   ').reason).toBe('TOO_SHORT');
  });

  it('rejects a quote longer than the limit, where the model dumped text', () => {
    const huge = 'x'.repeat(MAX_QUOTE_CHARS + 1);
    expect(expectNotFound(CONTRACT, huge).reason).toBe('TOO_LONG');
  });

  it('rejects an ellipsis INSIDE the quote', () => {
    /**
     * "A ... B" means words were left out, so the text as quoted does not appear in the
     * document. Matching the halves separately would let two unrelated passages be presented
     * as one continuous quotation.
     */
    expect(
      expectNotFound(CONTRACT, 'The total liability ... in aggregate.').reason,
    ).toBe('INNER_ELLIPSIS');
    expect(
      expectNotFound(CONTRACT, 'The total liability … in aggregate.').reason,
    ).toBe('INNER_ELLIPSIS');
  });

  it('rejects any quote against an empty document', () => {
    expect(findQuote(prepareDocument(''), 'anything at all')).toEqual({
      found: false,
      reason: 'EMPTY_DOCUMENT',
    });
  });
});

describe('a quote that appears more than once', () => {
  const repeated = [
    '1. Confidentiality',
    'Each party shall keep the information confidential.',
    '',
    '2. Sub-contractors',
    'Each party shall keep the information confidential.',
  ].join('\n');

  it('returns every occurrence', () => {
    const result = expectFound(repeated, 'Each party shall keep the information confidential.');
    expect(result.matches).toHaveLength(2);
  });

  it('every occurrence slices back to the quote', () => {
    const result = expectFound(repeated, 'Each party shall keep the information confidential.');
    for (const match of result.matches) {
      expect(repeated.slice(match.start, match.end)).toBe(
        'Each party shall keep the information confidential.',
      );
    }
  });

  it('returns occurrences in document order', () => {
    const result = expectFound(repeated, 'Each party shall keep the information confidential.');
    expect(result.matches[0]!.start).toBeLessThan(result.matches[1]!.start);
  });

  it('finds overlapping occurrences too', () => {
    const document = 'abab abab abab is repeated here';
    const result = expectFound(document, 'abab abab');
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cleanQuote', () => {
  it('strips matching straight quotes', () => {
    expect(cleanQuote('"hello there"').text).toBe('hello there');
  });

  it('strips matching curly quotes', () => {
    expect(cleanQuote('“hello there”').text).toBe('hello there');
  });

  it('strips repeated wrapping', () => {
    expect(cleanQuote('""hello there""').text).toBe('hello there');
  });

  it('does not strip an unmatched quote character', () => {
    expect(cleanQuote('the "Services" definition').text).toBe('the "Services" definition');
  });

  it('keeps an apostrophe inside a word', () => {
    expect(cleanQuote("the Supplier's obligations").text).toBe("the Supplier's obligations");
  });

  it('flags an inner ellipsis but not an outer one', () => {
    expect(cleanQuote('...start of it').hasInnerEllipsis).toBe(false);
    expect(cleanQuote('a ... b').hasInnerEllipsis).toBe(true);
  });
});

describe('real-world shapes', () => {
  it('finds a quote containing an AED amount and punctuation', () => {
    const document =
      'Notwithstanding anything to the contrary, the aggregate liability of either party ' +
      'under this Agreement shall not exceed AED 1,000,000 (one million UAE Dirhams).';
    expectOffsetsAddressTheText(
      document,
      'shall not exceed AED 1,000,000 (one million UAE Dirhams)',
    );
  });

  it('finds a quote across several lines of a numbered clause', () => {
    const document = [
      '7.2 Each party shall:',
      '   (a) comply with all applicable laws; and',
      '   (b) maintain adequate insurance.',
    ].join('\n');
    expectFound(document, '(a) comply with all applicable laws; and (b) maintain adequate insurance.');
  });

  it('handles a document with Windows line endings', () => {
    const document = 'The Supplier shall deliver\r\nthe Services within 30 days.';
    expectFound(document, 'The Supplier shall deliver the Services within 30 days.');
  });
});

describe('performance on a large document', () => {
  it('prepares a 150-page document and verifies many quotes quickly', () => {
    // Preparing the normalised forms is the expensive part, which is why it is cached per
    // document rather than redone per quote.
    const clause = 'The Supplier shall perform the Services with reasonable skill and care. ';
    const fullText = Array.from({ length: 4_000 }, (_, i) => `${i}. Clause ${i}\n${clause}`).join('\n');
    expect(fullText.length).toBeGreaterThan(300_000);

    const started = Date.now();
    const document = prepareDocument(fullText);
    for (let i = 0; i < 50; i += 1) {
      const result = findQuote(document, 'shall perform the Services with reasonable skill and care');
      expect(result.found).toBe(true);
    }
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(5_000);
  });
});
