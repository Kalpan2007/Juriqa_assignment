import { describe, expect, it, vi } from 'vitest';
import type { SseEvent } from '@ca/shared';
import { ThoroughRunner } from '../thorough-runner';
import { QuoteVerifierService } from '../../verification/quote-verifier.service';
import type { LlmService } from '../../../infrastructure/llm/llm.service';
import type { SearchedChunk } from '../../retrieval/retrieval.service';
import type { SseWriter } from '../../../core/sse/sse-writer';

/**
 * The thorough runner's job is honesty under failure.
 *
 * Reading a whole document when everything works is the easy case. These tests are mostly
 * about what the coverage says when it does NOT: a provider outage part-way through, an
 * unreadable page, a user pressing Stop. In each case the answer must be allowed to say what
 * was found and nothing more — never that the document lacks something.
 */

const DOCUMENT_TEXT = [
  '1. Confidentiality',
  'Each party shall keep the information confidential.',
  '2. Limitation of Liability',
  'The total liability shall not exceed AED 250,000 in aggregate.',
  '3. Governing Law',
  'This Agreement is governed by the laws of the DIFC.',
].join('\n');

function chunk(ordinal: number, text: string, ref: string): SearchedChunk {
  const start = DOCUMENT_TEXT.indexOf(text);
  return {
    id: `c${ordinal}`,
    ordinal,
    heading: null,
    clauseRef: ref,
    startOffset: start,
    endOffset: start + text.length,
    tokenCount: 50,
    text,
    score: 0,
  };
}

const BATCHES: SearchedChunk[][] = [
  [chunk(0, 'Each party shall keep the information confidential.', '1')],
  [chunk(1, 'The total liability shall not exceed AED 250,000 in aggregate.', '2')],
  [chunk(2, 'This Agreement is governed by the laws of the DIFC.', '3')],
];

/** Collects the events the runner emits. */
function makeWriter() {
  const events: SseEvent[] = [];
  const writer = {
    send: (event: SseEvent) => {
      events.push(event);
      return true;
    },
    comment: () => true,
    close: () => undefined,
    open: () => undefined,
    isClosed: false,
  } as unknown as SseWriter<SseEvent>;
  return { writer, events };
}

/** An LLM whose per-batch behaviour is scripted. */
function makeLlm(
  behaviour: Array<
    | { relevant: boolean; findings?: string; quotes?: string[] }
    | { throws: true }
  >,
) {
  let call = 0;
  return {
    structured: vi.fn(async () => {
      const step = behaviour[call];
      call += 1;
      if (step === undefined) return { relevant: false, findings: '', quotes: [] };
      if ('throws' in step) throw new Error('provider unavailable');
      return {
        relevant: step.relevant,
        findings: step.findings ?? '',
        quotes: (step.quotes ?? []).map((text) => ({ text })),
      };
    }),
  } as unknown as LlmService;
}

function run(
  llm: LlmService,
  options: {
    pages?: Array<{ number: number; startOffset: number; endOffset: number; isScanned: boolean }>;
    signal?: AbortSignal;
    totalChunks?: number;
  } = {},
) {
  const runner = new ThoroughRunner(llm, new QuoteVerifierService());
  const { writer, events } = makeWriter();

  return runner
    .run({
      documentId: 'doc-1',
      documentName: 'services.pdf',
      fullText: DOCUMENT_TEXT,
      question: 'Is there an arbitration clause?',
      batches: BATCHES,
      totalChunks: options.totalChunks ?? 3,
      pages: options.pages ?? [
        { number: 1, startOffset: 0, endOffset: DOCUMENT_TEXT.length, isScanned: false },
      ],
      isPdf: true,
      signal: options.signal ?? new AbortController().signal,
      writer,
    })
    .then((result) => ({ result, events }));
}

describe('ThoroughRunner — a complete scan', () => {
  it('reads every batch and reports complete coverage', async () => {
    const { result } = await run(
      makeLlm([
        { relevant: false },
        { relevant: true, findings: 'Liability is capped.', quotes: ['shall not exceed AED 250,000'] },
        { relevant: false },
      ]),
    );

    expect(result.coverage.chunksRead).toBe(3);
    expect(result.coverage.chunksTotal).toBe(3);
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.stoppedEarlyReason).toBeNull();
  });

  it('counts a batch as read even when it finds nothing relevant', async () => {
    // "Nothing here" is a useful answer, and the section WAS read — which is what makes the
    // coverage count honest.
    const { result } = await run(makeLlm([{ relevant: false }, { relevant: false }, { relevant: false }]));

    expect(result.coverage.chunksRead).toBe(3);
    expect(result.coverage.complete).toBe(true);
    expect(result.findings).toBe('');
  });

  it('collects findings only from relevant batches, labelled by clause', async () => {
    const { result } = await run(
      makeLlm([
        { relevant: false, findings: 'ignored because not relevant' },
        { relevant: true, findings: 'Liability is capped at AED 250,000.' },
        { relevant: true, findings: 'DIFC law governs.' },
      ]),
    );

    expect(result.findings).toContain('Liability is capped at AED 250,000.');
    expect(result.findings).toContain('DIFC law governs.');
    expect(result.findings).not.toContain('ignored because not relevant');
    // Labelled so the reduce step can attribute a finding to a clause.
    expect(result.findings).toContain('### 2');
  });

  it('reports progress for every batch', async () => {
    const { events } = await run(makeLlm([{ relevant: false }, { relevant: false }, { relevant: false }]));
    const progress = events.filter((event) => event.type === 'progress');

    // The assignment: real counts, not a spinner.
    expect(progress.length).toBeGreaterThanOrEqual(BATCHES.length);
    const last = progress[progress.length - 1];
    expect(last).toMatchObject({ done: 3, total: 3 });
  });
});

describe('ThoroughRunner — quotes are verified during the scan', () => {
  it('keeps a genuine quote', async () => {
    const { result } = await run(
      makeLlm([
        { relevant: true, findings: 'f', quotes: ['Each party shall keep the information confidential.'] },
        { relevant: false },
        { relevant: false },
      ]),
    );

    expect(result.verifiedQuotes).toEqual([
      'Each party shall keep the information confidential.',
    ]);
  });

  it('discards an invented quote before it can reach the answer', async () => {
    /**
     * The reduce step is only ever offered sentences that exist. Verifying here rather than
     * only at the end means an invented sentence cannot become the basis of the answer's
     * wording in the first place.
     */
    const { result } = await run(
      makeLlm([
        { relevant: true, findings: 'f', quotes: ['The parties agree to binding arbitration in Dubai.'] },
        { relevant: false },
        { relevant: false },
      ]),
    );

    expect(result.verifiedQuotes).toEqual([]);
  });

  it('deduplicates the same sentence found in two batches', async () => {
    const quote = 'This Agreement is governed by the laws of the DIFC.';
    const { result } = await run(
      makeLlm([
        { relevant: true, findings: 'a', quotes: [quote] },
        { relevant: true, findings: 'b', quotes: [quote] },
        { relevant: false },
      ]),
    );

    expect(result.verifiedQuotes).toHaveLength(1);
  });
});

describe('ThoroughRunner — a scan that does not finish', () => {
  it('reports partial coverage when a batch fails', async () => {
    // One failure is survivable, but that section was never seen — so not complete.
    const { result } = await run(
      makeLlm([{ relevant: true, findings: 'found something' }, { throws: true }, { relevant: false }]),
    );

    expect(result.coverage.chunksRead).toBe(2);
    expect(result.coverage.chunksTotal).toBe(3);
    expect(result.coverage.complete).toBe(false);
  });

  it('stops after repeated failures and says why', async () => {
    const { result } = await run(
      makeLlm([{ throws: true }, { throws: true }, { throws: true }]),
    );

    expect(result.coverage.chunksRead).toBe(0);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.stoppedEarlyReason).toContain('unavailable');
  });

  it('is never complete when a page has no readable text', async () => {
    /**
     * Even a scan that read every SECTION cannot be complete if a page had no text at all —
     * there is content in the document that nobody has seen (decision D10).
     */
    const { result } = await run(
      makeLlm([{ relevant: false }, { relevant: false }, { relevant: false }]),
      {
        pages: [
          { number: 1, startOffset: 0, endOffset: 100, isScanned: false },
          { number: 2, startOffset: 100, endOffset: 200, isScanned: true },
        ],
      },
    );

    expect(result.coverage.chunksRead).toBe(3);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.skippedPages).toEqual([2]);
  });

  it('stops immediately when the user aborts, and says so', async () => {
    const controller = new AbortController();
    controller.abort();

    const { result } = await run(makeLlm([{ relevant: false }]), { signal: controller.signal });

    expect(result.aborted).toBe(true);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.stoppedEarlyReason).toContain('stopped');
  });

  it('is not complete when the document has more sections than were batched', async () => {
    // Guards a wiring mistake: batches covering only part of the document must not be
    // reported as the whole of it.
    const { result } = await run(
      makeLlm([{ relevant: false }, { relevant: false }, { relevant: false }]),
      { totalChunks: 10 },
    );

    expect(result.coverage.chunksRead).toBe(3);
    expect(result.coverage.chunksTotal).toBe(10);
    expect(result.coverage.complete).toBe(false);
  });
});

describe('ThoroughRunner — assertUsable', () => {
  it('throws when nothing could be read at all', async () => {
    const runner = new ThoroughRunner(makeLlm([]), new QuoteVerifierService());
    const { result } = await run(makeLlm([{ throws: true }, { throws: true }, { throws: true }]));

    // An answer built on zero sections would be an answer about nothing.
    expect(() => runner.assertUsable(result)).toThrow();
  });

  it('does not throw for a user-aborted scan', async () => {
    const runner = new ThoroughRunner(makeLlm([]), new QuoteVerifierService());
    const controller = new AbortController();
    controller.abort();
    const { result } = await run(makeLlm([{ relevant: false }]), { signal: controller.signal });

    expect(() => runner.assertUsable(result)).not.toThrow();
  });

  it('does not throw for a partial but non-empty scan', async () => {
    const runner = new ThoroughRunner(makeLlm([]), new QuoteVerifierService());
    const { result } = await run(
      makeLlm([{ relevant: true, findings: 'something' }, { throws: true }, { relevant: false }]),
    );

    expect(() => runner.assertUsable(result)).not.toThrow();
  });
});
