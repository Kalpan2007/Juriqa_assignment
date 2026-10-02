import { describe, expect, it } from 'vitest';
import {
  DOCX_BLOCK_SEPARATOR,
  isDocxBlockTag,
  joinDocxBlocks,
  normalizeDocxBlockText,
} from './docx-block-text';

describe('isDocxBlockTag', () => {
  it('accepts the block tags, in any case', () => {
    expect(isDocxBlockTag('p')).toBe(true);
    expect(isDocxBlockTag('H2')).toBe(true);
    expect(isDocxBlockTag('TD')).toBe(true);
  });

  it('rejects inline tags', () => {
    expect(isDocxBlockTag('strong')).toBe(false);
    expect(isDocxBlockTag('span')).toBe(false);
    expect(isDocxBlockTag('table')).toBe(false);
  });
});

describe('normalizeDocxBlockText', () => {
  it('collapses runs of whitespace to one space', () => {
    expect(normalizeDocxBlockText('The    Company   shall')).toBe('The Company shall');
  });

  it('collapses the newlines mammoth leaves between inline elements', () => {
    expect(normalizeDocxBlockText('The\n  Company\n  shall')).toBe('The Company shall');
  });

  it('collapses non-breaking spaces, which Word uses liberally', () => {
    expect(normalizeDocxBlockText('AED 100,000')).toBe('AED 100,000');
  });

  it('trims the ends', () => {
    expect(normalizeDocxBlockText('   Governing law   ')).toBe('Governing law');
  });

  it('leaves an empty block empty', () => {
    expect(normalizeDocxBlockText('   \n  ')).toBe('');
  });

  it('never changes the characters of a word', () => {
    const text = 'Liability “cap” — AED 1,000,000 (one million)';
    expect(normalizeDocxBlockText(text)).toBe(text);
  });
});

describe('joinDocxBlocks', () => {
  it('joins blocks with a single newline and reports their ranges', () => {
    const { fullText, ranges } = joinDocxBlocks(['First clause.', 'Second clause.']);

    expect(fullText).toBe(`First clause.${DOCX_BLOCK_SEPARATOR}Second clause.`);
    expect(ranges).toEqual([
      { start: 0, end: 13 },
      { start: 14, end: 28 },
    ]);
  });

  it('slices back to exactly the original block text', () => {
    const blocks = ['1. Definitions', 'In this Agreement:', 'AED means UAE Dirhams.'];
    const { fullText, ranges } = joinDocxBlocks(blocks);

    blocks.forEach((block, index) => {
      const range = ranges[index]!;
      expect(fullText.slice(range.start, range.end)).toBe(block);
    });
  });

  it('keeps empty blocks as zero-length entries so block N stays block N', () => {
    const { fullText, ranges } = joinDocxBlocks(['A', '', 'B']);

    expect(ranges).toHaveLength(3);
    expect(ranges[1]).toEqual({ start: 2, end: 2 });
    expect(fullText.slice(ranges[2]!.start, ranges[2]!.end)).toBe('B');
  });

  it('handles a single block', () => {
    expect(joinDocxBlocks(['only'])).toEqual({
      fullText: 'only',
      ranges: [{ start: 0, end: 4 }],
    });
  });

  it('handles no blocks', () => {
    expect(joinDocxBlocks([])).toEqual({ fullText: '', ranges: [] });
  });
});
