import { describe, expect, it } from 'vitest';
import { extractCitationMarkers, parseQuotePayload } from '../domain/quote-payload';

/**
 * The quote payload is generated text that merely resembles JSON. Every case here is
 * something a model actually does, and none of them may take an answer down: a payload that
 * cannot be read means zero quotes and a notice, never a 500 and never a guessed quote.
 */
describe('parseQuotePayload — well-formed input', () => {
  it('parses a plain array', () => {
    const result = parseQuotePayload('[{"n":1,"text":"shall not exceed AED 100,000"}]');

    expect(result.error).toBeNull();
    expect(result.quotes).toEqual([{ n: 1, text: 'shall not exceed AED 100,000' }]);
  });

  it('keeps the document alias in a multi-document answer', () => {
    const result = parseQuotePayload('[{"n":1,"doc":"D2","text":"the cap is AED 500,000"}]');

    expect(result.quotes[0]).toEqual({ n: 1, doc: 'D2', text: 'the cap is AED 500,000' });
  });

  it('parses several quotes', () => {
    const result = parseQuotePayload(
      '[{"n":1,"text":"first quotation here"},{"n":2,"text":"second quotation here"}]',
    );
    expect(result.quotes).toHaveLength(2);
  });

  it('treats an empty payload as no quotes, not an error', () => {
    // The model legitimately has no quotes when the answer is "not found".
    expect(parseQuotePayload('')).toEqual({ quotes: [], error: null });
    expect(parseQuotePayload('   ')).toEqual({ quotes: [], error: null });
    expect(parseQuotePayload('[]')).toEqual({ quotes: [], error: null });
  });
});

describe('parseQuotePayload — malformations models actually produce', () => {
  it('unwraps a markdown code fence', () => {
    const result = parseQuotePayload('```json\n[{"n":1,"text":"inside a code fence"}]\n```');
    expect(result.quotes).toHaveLength(1);
  });

  it('unwraps a fence with no language tag', () => {
    const result = parseQuotePayload('```\n[{"n":1,"text":"inside a bare fence"}]\n```');
    expect(result.quotes).toHaveLength(1);
  });

  it('ignores prose around the array', () => {
    const result = parseQuotePayload(
      'Here are the quotes you asked for:\n[{"n":1,"text":"the actual quotation"}]\nHope that helps!',
    );
    expect(result.quotes).toHaveLength(1);
  });

  it('tolerates a trailing comma', () => {
    const result = parseQuotePayload('[{"n":1,"text":"a quotation here"},]');
    expect(result.quotes).toHaveLength(1);
  });

  it('accepts an object wrapper instead of a bare array', () => {
    const result = parseQuotePayload('{"quotes":[{"n":1,"text":"wrapped in an object"}]}');
    expect(result.quotes).toHaveLength(1);
  });

  it('coerces a citation number given as a string', () => {
    const result = parseQuotePayload('[{"n":"2","text":"numbered as a string"}]');
    expect(result.quotes[0]?.n).toBe(2);
  });

  it('keeps the good quotes when one entry is malformed', () => {
    // Discarding everything because of one bad entry would throw away real evidence.
    const result = parseQuotePayload(
      '[{"n":1,"text":"a good quotation"},{"bad":true},{"n":3,"text":"another good one"}]',
    );

    expect(result.quotes.map((q) => q.n)).toEqual([1, 3]);
    expect(result.error).toBeNull();
  });

  it('drops an entry with no text rather than inventing one', () => {
    const result = parseQuotePayload('[{"n":1},{"n":2,"text":"has real text"}]');
    expect(result.quotes).toHaveLength(1);
  });

  it('drops an entry with empty text', () => {
    expect(parseQuotePayload('[{"n":1,"text":""}]').quotes).toHaveLength(0);
  });

  it('drops an entry with a non-positive citation number', () => {
    expect(parseQuotePayload('[{"n":0,"text":"citation zero"}]').quotes).toHaveLength(0);
    expect(parseQuotePayload('[{"n":-1,"text":"negative citation"}]').quotes).toHaveLength(0);
  });
});

describe('parseQuotePayload — unreadable input', () => {
  it('reports an error rather than throwing', () => {
    const result = parseQuotePayload('this is not JSON in any sense at all');

    expect(result.quotes).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('reports an error for truncated JSON', () => {
    // What a stream cut off mid-payload looks like.
    const result = parseQuotePayload('[{"n":1,"text":"truncated mid');

    expect(result.quotes).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('reports an error for a bare string', () => {
    expect(parseQuotePayload('"just a string"').error).toBeTruthy();
  });

  it('never throws, whatever it is given', () => {
    const inputs = ['{', '[', 'null', 'undefined', '[[[[', '\u0000', '{"quotes":"not an array"}'];
    for (const input of inputs) {
      expect(() => parseQuotePayload(input), input).not.toThrow();
    }
  });
});

describe('parseQuotePayload — duplicates', () => {
  it('drops the same quote repeated under two citation numbers', () => {
    // Showing it twice makes an answer look better supported than it is.
    const result = parseQuotePayload(
      '[{"n":1,"text":"the cap is AED 100,000"},{"n":2,"text":"the cap is AED 100,000"}]',
    );

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.n).toBe(1);
  });

  it('treats quotes differing only in whitespace as the same', () => {
    const result = parseQuotePayload(
      '[{"n":1,"text":"the cap is AED 100,000"},{"n":2,"text":"the  cap   is AED 100,000"}]',
    );
    expect(result.quotes).toHaveLength(1);
  });

  it('keeps the same text attributed to DIFFERENT documents', () => {
    // Identical wording in two contracts is a real and interesting finding.
    const result = parseQuotePayload(
      '[{"n":1,"doc":"D1","text":"governed by DIFC law"},{"n":2,"doc":"D2","text":"governed by DIFC law"}]',
    );
    expect(result.quotes).toHaveLength(2);
  });
});

describe('extractCitationMarkers', () => {
  it('finds the markers used in the answer', () => {
    expect(extractCitationMarkers('The cap is AED 100,000 [1] under DIFC law [2].')).toEqual([1, 2]);
  });

  it('deduplicates a marker cited twice', () => {
    expect(extractCitationMarkers('As noted [1], and again [1].')).toEqual([1]);
  });

  it('returns them sorted', () => {
    expect(extractCitationMarkers('See [3] and [1] and [2].')).toEqual([1, 2, 3]);
  });

  it('ignores bracketed text that is not a citation', () => {
    expect(extractCitationMarkers('The term [as defined] applies [1].')).toEqual([1]);
  });

  it('ignores a marker of zero', () => {
    expect(extractCitationMarkers('Bad marker [0] here.')).toEqual([]);
  });

  it('returns nothing when there are no markers', () => {
    expect(extractCitationMarkers('An answer with no citations.')).toEqual([]);
  });

  it('lets a mismatch between markers and quotes be detected', () => {
    /**
     * The real use: the model cites [1] and [3] but supplies quotes 1 and 2. A marker with
     * no quote is rendered as plain text rather than a dead link.
     */
    const markers = extractCitationMarkers('First [1]. Third [3].');
    const supplied = parseQuotePayload(
      '[{"n":1,"text":"first quotation"},{"n":2,"text":"second quotation"}]',
    ).quotes.map((q) => q.n);

    expect(markers.filter((m) => !supplied.includes(m))).toEqual([3]);
    expect(supplied.filter((n) => !markers.includes(n))).toEqual([2]);
  });
});
