import { describe, expect, it } from 'vitest';
import { chunkSegments, MAX_TOKENS } from '../domain/chunker';
import { segmentClauses } from '../domain/clause-segmenter';
import { estimateTokens } from '../../../core/utils/tokens';

/** Builds a contract of `count` clauses, each with `sentences` sentences. */
function buildContract(count: number, sentences: number): string {
  const parts: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    parts.push(`${i}. Clause ${i}`);
    for (let s = 0; s < sentences; s += 1) {
      parts.push(`This is sentence ${s + 1} of clause ${i}, stating an obligation of the parties.`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

describe('chunkSegments — the invariant that matters', () => {
  it('every chunk’s text is exactly its slice of fullText', () => {
    // Principle 3: offsets are the backbone. A chunk whose text has drifted from fullText
    // would make every quote found inside it unverifiable.
    const fullText = buildContract(12, 3);
    const chunks = chunkSegments(fullText, segmentClauses(fullText));

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(fullText.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });

  it('numbers chunks consecutively from zero', () => {
    const fullText = buildContract(10, 3);
    const chunks = chunkSegments(fullText, segmentClauses(fullText));

    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it('keeps chunks in document order', () => {
    const fullText = buildContract(15, 2);
    const chunks = chunkSegments(fullText, segmentClauses(fullText));

    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.start).toBeGreaterThanOrEqual(chunks[i - 1]!.start);
    }
  });

  it('covers every clause: no text is silently dropped', () => {
    // If a chunk were lost, a thorough "read the whole document" scan would quietly miss it
    // and could then claim a clause does not exist.
    const fullText = buildContract(20, 2);
    const chunks = chunkSegments(fullText, segmentClauses(fullText));

    for (let i = 1; i <= 20; i += 1) {
      const needle = `sentence 1 of clause ${i},`;
      expect(
        chunks.some((chunk) => chunk.text.includes(needle)),
        `clause ${i} appears in no chunk`,
      ).toBe(true);
    }
  });
});

describe('chunkSegments — sizing', () => {
  it('splits a clause that is far too large', () => {
    const giant = `1. Giant Clause\n${'The parties agree to the following terms in detail. '.repeat(600)}`;
    const chunks = chunkSegments(giant, segmentClauses(giant));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Allow a little slack: the cut lands on a boundary, not an exact character count.
      expect(chunk.tokenCount).toBeLessThanOrEqual(MAX_TOKENS * 1.35);
    }
  });

  it('merges tiny sub-clauses instead of producing hundreds of fragments', () => {
    const many = Array.from({ length: 60 }, (_, i) => `${i + 1}.1 Short point ${i + 1}.`).join('\n');
    const segments = segmentClauses(many);
    const chunks = chunkSegments(many, segments);

    expect(segments.length).toBe(60);
    expect(chunks.length).toBeLessThan(10);
  });

  it('keeps a single small document as one chunk', () => {
    const small = '1. Term\nThis Agreement runs for 12 months.';
    expect(chunkSegments(small, segmentClauses(small))).toHaveLength(1);
  });

  it('returns nothing for no segments', () => {
    expect(chunkSegments('', [])).toEqual([]);
  });

  it('overlaps the pieces of a split clause, so a boundary fact is not stranded', () => {
    const giant = `1. Giant\n${'Sentence number one here. '.repeat(500)}`;
    const chunks = chunkSegments(giant, segmentClauses(giant));

    expect(chunks.length).toBeGreaterThan(1);
    // Consecutive pieces of the same clause share some text.
    expect(chunks[1]!.start).toBeLessThan(chunks[0]!.end);
  });

  it('always makes progress: never loops on a pathological range', () => {
    // No spaces, no sentence ends, no newlines — every preferred cut point is absent.
    const noBoundaries = `1. X\n${'x'.repeat(20_000)}`;
    const chunks = chunkSegments(noBoundaries, segmentClauses(noBoundaries));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(100);
  });
});

describe('chunkSegments — headings and references are carried through', () => {
  it('labels a chunk with its clause heading and reference', () => {
    const contract = [
      '1. Definitions',
      'Terms used in this Agreement.',
      '2. Limitation of Liability',
      'The cap is AED 100,000 in aggregate.',
    ].join('\n');

    const chunks = chunkSegments(contract, segmentClauses(contract));
    const liability = chunks.find((c) => c.text.includes('AED 100,000'))!;

    // The heading is what a coverage line shows the user, so it must survive merging.
    expect([liability.clauseRef, liability.heading]).toContainEqual(expect.anything());
  });
});

describe('chunkSegments — boilerplate', () => {
  it('marks a chunk that is mostly a running footer', () => {
    const fullText = 'Page 1 of 9';
    const segments = segmentClauses(fullText);
    const chunks = chunkSegments(fullText, segments, {
      boilerplateRanges: [{ start: 0, end: 11 }],
    });

    expect(chunks[0]!.isBoilerplate).toBe(true);
  });

  it('does NOT mark a real clause that merely contains a header line', () => {
    // The reason the ratio exists: an 800-token clause with one header line inside it is
    // still a real clause, and excluding it would hide contract text from search.
    const body = 'The Supplier shall indemnify the Customer against all claims. '.repeat(60);
    const fullText = `1. Indemnity\nPage 4 of 40\n${body}`;
    const headerStart = fullText.indexOf('Page 4 of 40');
    const chunks = chunkSegments(fullText, segmentClauses(fullText), {
      boilerplateRanges: [{ start: headerStart, end: headerStart + 12 }],
    });

    expect(chunks.some((c) => c.isBoilerplate)).toBe(false);
  });

  it('treats no boilerplate ranges as nothing being boilerplate', () => {
    const fullText = buildContract(5, 2);
    const chunks = chunkSegments(fullText, segmentClauses(fullText));

    expect(chunks.every((c) => !c.isBoilerplate)).toBe(true);
  });
});

describe('chunkSegments — token counts are honest', () => {
  it('reports the token count of its own text', () => {
    const fullText = buildContract(8, 3);
    for (const chunk of chunkSegments(fullText, segmentClauses(fullText))) {
      expect(chunk.tokenCount).toBe(estimateTokens(chunk.text));
    }
  });
});
