import { describe, expect, it } from 'vitest';
import {
  joinHyphenBreaks,
  normalize,
  stripWhitespace,
  toOriginalRange,
} from '../domain/normalizer';

/**
 * The index map is what makes verification usable rather than merely correct: it is how a
 * match in loosened text becomes a highlight on real characters. These tests check the map
 * directly, because an off-by-one here puts every citation highlight slightly wrong — a
 * failure that looks like a viewer bug and is almost impossible to trace back.
 */
describe('normalize — what it changes', () => {
  it('collapses runs of whitespace to a single space', () => {
    expect(normalize('The   total\t\tliability').norm).toBe('The total liability');
  });

  it('collapses newlines', () => {
    expect(normalize('line one\nline two').norm).toBe('line one line two');
  });

  it('trims the ends', () => {
    expect(normalize('   padded   ').norm).toBe('padded');
  });

  it('converts curly quotes to straight', () => {
    expect(normalize('“Services” and ‘Term’').norm).toBe('"Services" and \'Term\'');
  });

  it('converts every dash variant to a hyphen', () => {
    expect(normalize('a‐b‑c‒d–e—f―g−h').norm).toBe('a-b-c-d-e-f-g-h');
  });

  it('resolves ligatures through NFKC', () => {
    expect(normalize('ﬁnal ﬂow').norm).toBe('final flow');
  });

  it('removes soft hyphens and zero-width characters', () => {
    expect(normalize('lia­bility').norm).toBe('liability');
    expect(normalize('Sup​plier').norm).toBe('Supplier');
    expect(normalize('﻿BOM').norm).toBe('BOM');
  });

  it('treats a non-breaking space as whitespace', () => {
    expect(normalize('AED 100,000').norm).toBe('AED 100,000');
  });
});

describe('normalize — what it must NOT change', () => {
  it('keeps case', () => {
    // Case folding here would let "The Supplier" match "the supplier" in the exact pass,
    // and the CASE_INSENSITIVE kind could never be distinguished.
    expect(normalize('The Supplier').norm).toBe('The Supplier');
  });

  it('keeps punctuation', () => {
    expect(normalize('exceed AED 100,000 (one hundred thousand).').norm).toBe(
      'exceed AED 100,000 (one hundred thousand).',
    );
  });

  it('never alters a word', () => {
    const text = 'indemnify, defend and hold harmless';
    expect(normalize(text).norm).toBe(text);
  });

  it('keeps digits exactly', () => {
    expect(normalize('AED 1,000,000').norm).toBe('AED 1,000,000');
  });
});

describe('normalize — the index map', () => {
  it('has one entry per normalised character', () => {
    const result = normalize('The  Supplier');
    expect(result.map).toHaveLength(result.norm.length);
  });

  it('maps every character back to a real original index', () => {
    const original = '  The   total\nliability  ';
    const { norm, map } = normalize(original);

    for (let i = 0; i < norm.length; i += 1) {
      const originalIndex = map[i]!;
      expect(originalIndex).toBeGreaterThanOrEqual(0);
      expect(originalIndex).toBeLessThan(original.length);
    }
  });

  it('maps a collapsed space run to the first whitespace character', () => {
    const original = 'A    B';
    const { norm, map } = normalize(original);

    expect(norm).toBe('A B');
    expect(map[0]).toBe(0); // "A"
    expect(map[1]).toBe(1); // the space run starts at index 1
    expect(map[2]).toBe(5); // "B"
  });

  it('is monotonically non-decreasing', () => {
    // A map that went backwards would produce inverted highlight ranges.
    const { map } = normalize('The ﬁnal  lia­bility “cap” is AED 100,000.');
    for (let i = 1; i < map.length; i += 1) {
      expect(map[i]!).toBeGreaterThanOrEqual(map[i - 1]!);
    }
  });

  it('maps both halves of a ligature to the same original index', () => {
    const original = 'aﬁb';
    const { norm, map } = normalize(original);

    expect(norm).toBe('afib');
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(1);
  });
});

describe('toOriginalRange', () => {
  it('maps a range back so it slices to the same words', () => {
    const original = 'The   total liability of   the Supplier';
    const normalized = normalize(original);
    const needle = 'total liability';
    const normStart = normalized.norm.indexOf(needle);

    const range = toOriginalRange(normalized, normStart, normStart + needle.length, original.length);

    expect(original.slice(range.start, range.end)).toBe('total liability');
  });

  it('includes the final character of the match', () => {
    // The classic off-by-one: using map[end] directly drops the last character.
    const original = 'exceed AED 100,000.';
    const normalized = normalize(original);
    const needle = 'AED 100,000';
    const normStart = normalized.norm.indexOf(needle);

    const range = toOriginalRange(normalized, normStart, normStart + needle.length, original.length);

    expect(original.slice(range.start, range.end)).toBe('AED 100,000');
  });

  it('handles a match that ends at the very end of the text', () => {
    const original = 'ends with liability';
    const normalized = normalize(original);
    const range = toOriginalRange(normalized, 10, normalized.norm.length, original.length);

    expect(original.slice(range.start, range.end)).toBe('liability');
  });

  it('never exceeds the original length', () => {
    const original = 'short';
    const normalized = normalize(original);
    const range = toOriginalRange(normalized, 0, 99, original.length);

    expect(range.end).toBeLessThanOrEqual(original.length);
  });
});

describe('stripWhitespace', () => {
  it('removes spaces and maps back to normalised indices', () => {
    const { stripped, map } = stripWhitespace('a b c');

    expect(stripped).toBe('abc');
    expect(map).toEqual([0, 2, 4]);
  });

  it('handles text with no spaces', () => {
    expect(stripWhitespace('abc')).toEqual({ stripped: 'abc', map: [0, 1, 2] });
  });
});

describe('joinHyphenBreaks', () => {
  it('joins a word broken across a line', () => {
    expect(joinHyphenBreaks('liabil-\nity').joined).toBe('liability');
  });

  it('joins across a Windows line ending with indentation', () => {
    expect(joinHyphenBreaks('indem-\r\n   nify').joined).toBe('indemnify');
  });

  it('does NOT join a genuine compound word', () => {
    // "non-exclusive" must survive: joining it would change the word.
    expect(joinHyphenBreaks('non-exclusive licence').joined).toBe('non-exclusive licence');
  });

  it('does not join across a hyphen followed by a space but no line break', () => {
    expect(joinHyphenBreaks('cost- benefit').joined).toBe('cost- benefit');
  });

  it('does not join a hyphen between a digit and a letter', () => {
    expect(joinHyphenBreaks('30-\nday').joined).toBe('30-\nday');
  });

  it('maps every joined character back to the original', () => {
    const original = 'the liabil-\nity cap';
    const { joined, map } = joinHyphenBreaks(original);

    expect(map).toHaveLength(joined.length);
    for (let i = 0; i < joined.length; i += 1) {
      expect(original[map[i]!]).toBe(joined[i]);
    }
  });

  it('leaves text with no hyphen breaks untouched', () => {
    const text = 'nothing to join here';
    expect(joinHyphenBreaks(text).joined).toBe(text);
  });
});
