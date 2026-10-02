import { describe, expect, it } from 'vitest';
import { matchHeading, segmentClauses, stripLeadingRef } from '../domain/clause-segmenter';

describe('matchHeading — what counts as a clause heading', () => {
  it('recognises a numbered heading', () => {
    expect(matchHeading('4. Limitation of Liability')).toEqual({
      ref: '4',
      heading: 'Limitation of Liability',
      depth: 1,
    });
  });

  it('recognises nested numbering and its depth', () => {
    expect(matchHeading('4.2 Cap on Liability')).toMatchObject({ ref: '4.2', depth: 2 });
    expect(matchHeading('4.2.1 Exclusions')).toMatchObject({ ref: '4.2.1', depth: 3 });
  });

  it('recognises Article and Section forms', () => {
    expect(matchHeading('ARTICLE IV')).toMatchObject({ ref: 'ARTICLE IV', depth: 1 });
    expect(matchHeading('Section 5.2 Payment Terms')).toMatchObject({
      ref: 'Section 5.2',
      heading: 'Payment Terms',
      depth: 2,
    });
  });

  it('recognises lettered sub-clauses', () => {
    expect(matchHeading('(a) Each party shall keep the information confidential.')).toMatchObject({
      ref: 'a',
      depth: 3,
    });
    expect(matchHeading('(iv) Force majeure events.')).toMatchObject({ ref: 'iv' });
  });

  it('recognises an ALL-CAPS heading with no number', () => {
    expect(matchHeading('LIMITATION OF LIABILITY')).toEqual({
      ref: null,
      heading: 'LIMITATION OF LIABILITY',
      depth: 1,
    });
  });

  it('does NOT split on a cross-reference inside a sentence', () => {
    // The whole reason headings must match a complete line.
    expect(matchHeading('as further described in Section 4.2 below, the cap applies')).toBeNull();
    expect(matchHeading('The parties agree, pursuant to 4.2, that liability is capped.')).toBeNull();
  });

  it('does not treat a long line as a heading', () => {
    const long = `4. ${'Liability provisions apply in all circumstances whatsoever. '.repeat(4)}`;
    expect(matchHeading(long)).toBeNull();
  });

  it('does not treat a shouted sentence as a heading', () => {
    expect(matchHeading('THE SUPPLIER SHALL NOT BE LIABLE FOR INDIRECT LOSS.')).toBeNull();
  });

  it('ignores blank lines', () => {
    expect(matchHeading('   ')).toBeNull();
  });
});

describe('stripLeadingRef — the mechanism that makes renumbering invisible', () => {
  it('removes a numeric reference', () => {
    expect(stripLeadingRef('1.2 Payment terms are net 30 days.', '1.2')).toBe(
      'Payment terms are net 30 days.',
    );
  });

  it('makes a renumbered clause identical to the original', () => {
    // Decision D7 in one assertion: this is why inserting a clause does not report every
    // later clause as changed.
    const before = stripLeadingRef('1.2 Payment terms are net 30 days.', '1.2');
    const after = stripLeadingRef('1.3 Payment terms are net 30 days.', '1.3');
    expect(before).toBe(after);
  });

  it('removes a lettered reference with its brackets', () => {
    expect(stripLeadingRef('(a) Each party shall comply.', 'a')).toBe('Each party shall comply.');
  });

  it('removes an Article reference with a dash separator', () => {
    expect(stripLeadingRef('Article 4 - Liability', 'Article 4')).toBe('Liability');
  });

  it('leaves text with no reference alone', () => {
    expect(stripLeadingRef('LIMITATION OF LIABILITY', null)).toBe('LIMITATION OF LIABILITY');
  });

  it('does not strip a number that is part of the body', () => {
    expect(stripLeadingRef('4. The cap is AED 4.2 million.', '4')).toBe(
      'The cap is AED 4.2 million.',
    );
  });
});

describe('segmentClauses', () => {
  const contract = [
    'SERVICES AGREEMENT',
    '',
    'This Agreement is made between Alpha FZ-LLC and Beta DMCC.',
    '',
    '1. Definitions',
    'In this Agreement the following terms apply.',
    '',
    '2. Term',
    'This Agreement runs for 24 months.',
    '',
    '3. Limitation of Liability',
    '3.1 The cap is AED 100,000.',
    '3.2 Nothing limits liability for fraud.',
  ].join('\n');

  it('splits at every heading', () => {
    const segments = segmentClauses(contract);
    const refs = segments.map((s) => s.ref);

    expect(refs).toEqual([null, '1', '2', '3', '3.1', '3.2']);
  });

  it('keeps the preamble, which holds the parties', () => {
    const segments = segmentClauses(contract);

    // "SERVICES AGREEMENT" is an ALL-CAPS heading, so it opens the first segment.
    expect(segments[0]!.text).toContain('Alpha FZ-LLC');
  });

  it('gives every segment offsets that slice back to its own text', () => {
    for (const segment of segmentClauses(contract)) {
      expect(contract.slice(segment.start, segment.end)).toBe(segment.text);
    }
  });

  it('produces segments that are contiguous and in order', () => {
    const segments = segmentClauses(contract);

    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.start).toBeGreaterThan(segments[i - 1]!.start);
      // Trailing whitespace is trimmed off each segment, so end <= next start.
      expect(segments[i - 1]!.end).toBeLessThanOrEqual(segments[i]!.start);
    }
  });

  it('includes the heading in text but not in body', () => {
    const liability = segmentClauses(contract).find((s) => s.ref === '3.1')!;

    expect(liability.text).toBe('3.1 The cap is AED 100,000.');
    expect(liability.body).toBe('The cap is AED 100,000.');
  });

  it('returns one segment for text with no headings', () => {
    const letter = 'Dear Sir,\n\nWe write regarding the agreement.\n\nYours faithfully,';
    const segments = segmentClauses(letter);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe(letter);
  });

  it('returns nothing for empty text', () => {
    expect(segmentClauses('')).toEqual([]);
    expect(segmentClauses('   \n  \n')).toEqual([]);
  });

  it('covers the whole document: no clause text is lost', () => {
    const segments = segmentClauses(contract);
    const covered = new Set<number>();
    for (const segment of segments) {
      for (let i = segment.start; i < segment.end; i += 1) covered.add(i);
    }
    for (let i = 0; i < contract.length; i += 1) {
      if (/\S/.test(contract[i]!)) {
        expect(covered.has(i), `character ${i} (${contract[i]}) is in no segment`).toBe(true);
      }
    }
  });
});
