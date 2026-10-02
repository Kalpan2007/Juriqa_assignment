import { describe, expect, it } from 'vitest';
import {
  buildSearchQuery,
  classifyQuestion,
  truncateQuery,
} from '../domain/question-classifier';
import {
  batchChunksByBudget,
  computeBudget,
  MIN_EXCERPT_TOKENS,
  OUTPUT_RESERVE_TOKENS,
  selectChunksByBudget,
  splitBudgetAcrossDocuments,
} from '../domain/budgeter';
import { buildCoverage, collapseRanges, mayAssertAbsence, sectionLabel } from '../domain/coverage';

describe('classifyQuestion — existence questions need the whole document', () => {
  it.each([
    'Is there an arbitration clause?',
    'Are there any termination rights?',
    'Does it contain a non-compete?',
    'Does the agreement mention force majeure?',
    'Is there any clause about data protection?',
    'Are any indemnity provisions included?',
    'Is anything missing from the payment terms?',
    'Was the confidentiality clause omitted?',
    'Can the contract be signed without a witness clause?',
    'Tell me whether it contains an exclusivity provision',
  ])('treats %j as needing a whole-document read', (question) => {
    const result = classifyQuestion(question);
    expect(result.needsWholeDocument, result.reason).toBe(true);
  });
});

describe('classifyQuestion — completeness questions need the whole document', () => {
  it.each([
    'List all the payment obligations',
    'List every deadline in the contract',
    'What are all the termination rights?',
    'How many clauses mention liability?',
    'Give me a complete list of the parties',
    'Find all references to AED amounts',
    'Summarise the whole document',
    'What is each party obliged to do?',
  ])('treats %j as needing a whole-document read', (question) => {
    const result = classifyQuestion(question);
    expect(result.needsWholeDocument, result.reason).toBe(true);
  });
});

describe('classifyQuestion — specific questions do not', () => {
  it.each([
    'What is the liability cap?',
    'Who are the parties to this agreement?',
    'What is the notice period for termination?',
    'Which law governs this contract?',
    'When does the term start?',
    'What happens if the Supplier is late?',
    'Explain the indemnity in clause 7',
  ])('treats %j as a specific question', (question) => {
    const result = classifyQuestion(question);
    expect(result.needsWholeDocument, result.reason).toBe(false);
    expect(result.intent).toBe('SPECIFIC');
  });
});

describe('classifyQuestion — the bias is deliberate', () => {
  it('prefers completeness over existence when both could match', () => {
    // "list all" is the stronger signal and is checked first.
    expect(classifyQuestion('List all clauses that mention whether there is a cap').intent).toBe(
      'COMPLETENESS',
    );
  });

  it('always reports which rule fired, so a decision can be explained', () => {
    expect(classifyQuestion('Is there a cap?').reason).toBeTruthy();
    expect(classifyQuestion('What is the cap?').reason).toBeTruthy();
  });

  it('handles an empty question without crashing', () => {
    expect(classifyQuestion('').needsWholeDocument).toBe(false);
  });
});

describe('buildSearchQuery', () => {
  it('appends the previous question to a short follow-up', () => {
    // "and what about termination?" has almost no overlap with the document on its own.
    const query = buildSearchQuery('and what about termination?', 'What is the liability cap?');

    expect(query).toContain('termination');
    expect(query).toContain('liability cap');
  });

  it('leaves a self-contained question alone', () => {
    const question = 'What notice period applies when the Supplier terminates for convenience?';
    expect(buildSearchQuery(question, 'What is the liability cap?')).toBe(question);
  });

  it('works with no previous question', () => {
    expect(buildSearchQuery('What is the cap?', null)).toBe('What is the cap?');
    expect(buildSearchQuery('What is the cap?')).toBe('What is the cap?');
  });

  it('never includes the previous ANSWER, only the previous question', () => {
    // Searching the model's own words would retrieve whatever it happened to say.
    const query = buildSearchQuery('and that one?', 'What is the cap?');
    expect(query).toBe('and that one? What is the cap?');
  });
});

describe('truncateQuery', () => {
  it('leaves a normal question alone', () => {
    expect(truncateQuery('What is the liability cap?')).toBe('What is the liability cap?');
  });

  it('truncates a very long question at a word boundary', () => {
    const long = 'liability '.repeat(100);
    const result = truncateQuery(long);

    expect(result.length).toBeLessThanOrEqual(400);
    expect(result).not.toMatch(/liabilit$/);
  });
});

describe('computeBudget', () => {
  it('leaves room for excerpts after the fixed costs', () => {
    const budget = computeBudget({
      maxInputTokens: 12_000,
      systemPromptText: 'x'.repeat(3_500), // ~1000 tokens
      historyText: '',
      questionText: 'What is the liability cap?',
    });

    expect(budget.exhausted).toBe(false);
    expect(budget.excerptTokens).toBeGreaterThan(8_000);
    expect(budget.excerptTokens).toBeLessThan(12_000);
  });

  it('always reserves output tokens', () => {
    const budget = computeBudget({
      maxInputTokens: 10_000,
      systemPromptText: '',
      historyText: '',
      questionText: '',
    });

    // The reserve is never traded away for more excerpts: on a reasoning model, reasoning
    // tokens are billed as output, and starving it produces an EMPTY answer.
    expect(budget.excerptTokens).toBe(10_000 - OUTPUT_RESERVE_TOKENS);
  });

  it('reports exhaustion rather than sending a useless request', () => {
    const budget = computeBudget({
      maxInputTokens: 2_000,
      systemPromptText: 'x'.repeat(3_500),
      historyText: 'y'.repeat(3_500),
      questionText: 'short',
    });

    expect(budget.exhausted).toBe(true);
  });

  it('never returns a negative budget', () => {
    const budget = computeBudget({
      maxInputTokens: 100,
      systemPromptText: 'x'.repeat(100_000),
      historyText: '',
      questionText: '',
    });

    expect(budget.excerptTokens).toBe(0);
    expect(budget.exhausted).toBe(true);
  });

  it('accounts for history, so a long conversation shrinks the excerpts', () => {
    const base = { maxInputTokens: 12_000, systemPromptText: '', questionText: 'q' };
    const withoutHistory = computeBudget({ ...base, historyText: '' });
    const withHistory = computeBudget({ ...base, historyText: 'x'.repeat(7_000) });

    expect(withHistory.excerptTokens).toBeLessThan(withoutHistory.excerptTokens);
  });
});

describe('selectChunksByBudget', () => {
  const chunks = [
    { id: 'a', ordinal: 0, tokenCount: 400, score: 0.2 },
    { id: 'b', ordinal: 1, tokenCount: 400, score: 0.9 },
    { id: 'c', ordinal: 2, tokenCount: 400, score: 0.5 },
    { id: 'd', ordinal: 3, tokenCount: 400, score: 0.1 },
  ];

  it('keeps the highest-scoring chunks when not everything fits', () => {
    const { selected } = selectChunksByBudget(chunks, 800);
    expect(selected.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('returns the selection in DOCUMENT order, not score order', () => {
    // The model must read clause 2 before clause 14: a later clause often qualifies an
    // earlier one, and score order would scramble that.
    const { selected } = selectChunksByBudget(chunks, 1_200);
    expect(selected.map((c) => c.ordinal)).toEqual([...selected.map((c) => c.ordinal)].sort((a, b) => a - b));
  });

  it('reports what did not fit', () => {
    const { selected, omitted } = selectChunksByBudget(chunks, 800);
    expect(selected).toHaveLength(2);
    expect(omitted).toHaveLength(2);
  });

  it('never exceeds the budget', () => {
    const { tokensUsed } = selectChunksByBudget(chunks, 900);
    expect(tokensUsed).toBeLessThanOrEqual(900);
  });

  it('selects nothing when the budget is zero', () => {
    const { selected, omitted } = selectChunksByBudget(chunks, 0);
    expect(selected).toEqual([]);
    expect(omitted).toHaveLength(4);
  });

  it('skips an oversized chunk but still takes the ones that fit', () => {
    const mixed = [
      { id: 'huge', ordinal: 0, tokenCount: 5_000, score: 1 },
      { id: 'small', ordinal: 1, tokenCount: 200, score: 0.5 },
    ];
    const { selected } = selectChunksByBudget(mixed, 1_000);

    expect(selected.map((c) => c.id)).toEqual(['small']);
  });

  it('handles no chunks', () => {
    expect(selectChunksByBudget([], 1_000)).toEqual({ selected: [], omitted: [], tokensUsed: 0 });
  });
});

describe('batchChunksByBudget', () => {
  const chunks = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`,
    ordinal: i,
    tokenCount: 300,
  }));

  it('splits chunks into batches that each fit', () => {
    const batches = batchChunksByBudget(chunks, 1_000);

    for (const batch of batches) {
      const total = batch.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
      // A batch may exceed only when a single chunk does.
      if (batch.length > 1) expect(total).toBeLessThanOrEqual(1_000);
    }
  });

  it('includes every chunk exactly once', () => {
    // Dropping one would make `complete` a lie.
    const batches = batchChunksByBudget(chunks, 1_000);
    const ids = batches.flat().map((c) => c.id);

    expect(ids).toHaveLength(chunks.length);
    expect(new Set(ids).size).toBe(chunks.length);
  });

  it('preserves document order across and within batches', () => {
    const ordinals = batchChunksByBudget(chunks, 1_000).flat().map((c) => c.ordinal);
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
  });

  it('gives an oversized chunk its own batch rather than dropping it', () => {
    const withGiant = [
      { id: 'a', ordinal: 0, tokenCount: 200 },
      { id: 'giant', ordinal: 1, tokenCount: 9_000 },
      { id: 'b', ordinal: 2, tokenCount: 200 },
    ];
    const batches = batchChunksByBudget(withGiant, 1_000);

    expect(batches.flat().map((c) => c.id)).toEqual(['a', 'giant', 'b']);
    expect(batches.some((batch) => batch.length === 1 && batch[0]!.id === 'giant')).toBe(true);
  });

  it('handles no chunks', () => {
    expect(batchChunksByBudget([], 1_000)).toEqual([]);
  });
});

describe('splitBudgetAcrossDocuments', () => {
  it('divides the budget evenly', () => {
    expect(splitBudgetAcrossDocuments(9_000, 3, 500)).toEqual({ perDocument: 3_000, feasible: true });
  });

  it('reports infeasible when a document cannot get its minimum', () => {
    // Answering about a subset while claiming to compare all of them would be dishonest.
    expect(splitBudgetAcrossDocuments(1_000, 5, 500).feasible).toBe(false);
  });

  it('handles zero documents', () => {
    expect(splitBudgetAcrossDocuments(9_000, 0, 500)).toEqual({ perDocument: 0, feasible: false });
  });
});

describe('buildCoverage', () => {
  const pages = [
    { number: 1, startOffset: 0, endOffset: 100, isScanned: false },
    { number: 2, startOffset: 100, endOffset: 200, isScanned: false },
    { number: 3, startOffset: 200, endOffset: 300, isScanned: false },
  ];
  const chunk = (ordinal: number, start: number, end: number, ref: string | null = null) => ({
    ordinal,
    clauseRef: ref,
    heading: null,
    startOffset: start,
    endOffset: end,
  });

  it('reports what was read out of what exists', () => {
    const coverage = buildCoverage({
      mode: 'RETRIEVAL',
      readChunks: [chunk(0, 0, 50), chunk(1, 50, 120)],
      totalChunks: 10,
      pages,
      isPdf: true,
    });

    expect(coverage.chunksRead).toBe(2);
    expect(coverage.chunksTotal).toBe(10);
    expect(coverage.complete).toBe(false);
  });

  it('is complete only when every section was read', () => {
    const coverage = buildCoverage({
      mode: 'THOROUGH',
      readChunks: [chunk(0, 0, 150), chunk(1, 150, 300)],
      totalChunks: 2,
      pages,
      isPdf: true,
    });

    expect(coverage.complete).toBe(true);
    expect(mayAssertAbsence(coverage)).toBe(true);
  });

  it('is NEVER complete when a page had no readable text', () => {
    /**
     * Decision D10 and the honesty rule together: there is text in this document nobody has
     * seen, so however many sections were read, absence can never be asserted.
     */
    const coverage = buildCoverage({
      mode: 'THOROUGH',
      readChunks: [chunk(0, 0, 300)],
      totalChunks: 1,
      pages: [...pages.slice(0, 2), { number: 3, startOffset: 200, endOffset: 300, isScanned: true }],
      isPdf: true,
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.skippedPages).toEqual([3]);
    expect(mayAssertAbsence(coverage)).toBe(false);
  });

  it('is NEVER complete when the run stopped early', () => {
    const coverage = buildCoverage({
      mode: 'THOROUGH',
      readChunks: [chunk(0, 0, 300)],
      totalChunks: 1,
      pages,
      isPdf: true,
      stoppedEarlyReason: 'the AI service was busy',
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.stoppedEarlyReason).toBe('the AI service was busy');
    expect(mayAssertAbsence(coverage)).toBe(false);
  });

  it('is not complete for a document with no sections at all', () => {
    const coverage = buildCoverage({
      mode: 'THOROUGH',
      readChunks: [],
      totalChunks: 0,
      pages,
      isPdf: true,
    });

    expect(coverage.complete).toBe(false);
  });

  it('reports the pages the read sections fall on', () => {
    const coverage = buildCoverage({
      mode: 'RETRIEVAL',
      readChunks: [chunk(0, 0, 50), chunk(5, 250, 290)],
      totalChunks: 10,
      pages,
      isPdf: true,
    });

    expect(coverage.pagesCovered).toEqual(['1', '3']);
  });

  it('omits pages entirely for a DOCX', () => {
    // A DOCX has one virtual page, so "pages 1" would be noise (decision D13).
    const coverage = buildCoverage({
      mode: 'RETRIEVAL',
      readChunks: [chunk(0, 0, 50)],
      totalChunks: 4,
      pages: [{ number: 1, startOffset: 0, endOffset: 300, isScanned: false }],
      isPdf: false,
    });

    expect(coverage.pagesCovered).toBeNull();
    expect(coverage.sectionsCovered).toHaveLength(1);
  });

  it('labels sections by clause reference where there is one', () => {
    const coverage = buildCoverage({
      mode: 'RETRIEVAL',
      readChunks: [chunk(0, 0, 50, '4.2'), chunk(1, 50, 100)],
      totalChunks: 5,
      pages,
      isPdf: true,
    });

    expect(coverage.sectionsCovered).toEqual(['4.2', 'Part 2']);
  });
});

describe('sectionLabel', () => {
  it('prefers the clause reference', () => {
    expect(
      sectionLabel({ ordinal: 3, clauseRef: '7.1', heading: 'Liability', startOffset: 0, endOffset: 1 }),
    ).toBe('7.1');
  });

  it('falls back to the heading', () => {
    expect(
      sectionLabel({ ordinal: 3, clauseRef: null, heading: 'Liability', startOffset: 0, endOffset: 1 }),
    ).toBe('Liability');
  });

  it('falls back to the position', () => {
    expect(
      sectionLabel({ ordinal: 3, clauseRef: null, heading: null, startOffset: 0, endOffset: 1 }),
    ).toBe('Part 4');
  });

  it('truncates a very long heading', () => {
    const label = sectionLabel({
      ordinal: 0,
      clauseRef: null,
      heading: 'A heading that goes on and on and on well past any reasonable length',
      startOffset: 0,
      endOffset: 1,
    });
    expect(label.length).toBeLessThanOrEqual(40);
  });
});

describe('collapseRanges', () => {
  it('collapses consecutive numbers', () => {
    expect(collapseRanges([3, 4, 5, 41, 88, 89, 90])).toEqual(['3–5', '41', '88–90']);
  });

  it('handles a single value', () => {
    expect(collapseRanges([7])).toEqual(['7']);
  });

  it('handles nothing', () => {
    expect(collapseRanges([])).toEqual([]);
  });
});

describe('the budget guards against a useless request', () => {
  it('MIN_EXCERPT_TOKENS is enough for at least a short clause', () => {
    expect(MIN_EXCERPT_TOKENS).toBeGreaterThanOrEqual(300);
  });
});
