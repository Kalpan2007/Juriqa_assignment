import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import path from 'node:path';
import dotenv from 'dotenv';
import { QUOTES_DELIMITER, type CoverageDto } from '@ca/shared';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/core/filters/all-exceptions.filter';
import {
  LlmService,
  type StreamOptions,
  type StructuredOptions,
} from '../../src/infrastructure/llm/llm.service';
import { buildPdf, emptyPage, textPage } from '../fixtures/build-pdf';
import { HAS_ENV, waitForFinalStatus } from './harness';
import { parseSse } from './chat-harness';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Whole-document reading, over HTTP (assignment A4).
 *
 * The requirement being tested is the assignment's sharpest one: if the app read only part of
 * a document, it must not answer as though it read all of it. So these tests drive the scan
 * into failure on purpose and check what the coverage says afterwards.
 */

/** A contract long enough to be split into several batches. */
const CLAUSES = Array.from({ length: 48 }, (_, index) => [
  `${index + 1}. Clause ${index + 1}`,
  `This clause ${index + 1} obliges the Supplier to perform duty number ${index + 1} promptly. The Supplier shall adhere to all standards and quality metrics specified in the schedule. Furthermore, failure to perform promptly constitutes a breach under this agreement and entitles the customer to remedies.`,
]).flat();

/** A scripted LLM covering both phases of the map-reduce. */
class ThoroughLlm {
  /** Set to make the Nth map call throw, simulating a provider outage. */
  failMapCallsFrom: number | null = null;
  mapCalls = 0;
  reducePrompt = '';
  reduceResponse = `Nothing relevant was found.\n${QUOTES_DELIMITER}\n[]`;
  /** Quote each map batch should claim to have found. */
  mapQuote: string | null = null;

  async structured<T>(options: StructuredOptions<T>): Promise<T> {
    this.mapCalls += 1;
    if (this.failMapCallsFrom !== null && this.mapCalls >= this.failMapCallsFrom) {
      throw new Error('provider unavailable');
    }
    const result = {
      relevant: this.mapQuote !== null,
      findings: this.mapQuote === null ? '' : 'Found an obligation.',
      quotes: this.mapQuote === null ? [] : [{ text: this.mapQuote }],
    };
    return options.schema.parse(result);
  }

  async stream(options: StreamOptions): Promise<{ text: string; aborted: boolean }> {
    this.reducePrompt = options.messages.map((message) => message.content).join('\n---\n');
    for (let index = 0; index < this.reduceResponse.length; index += 9) {
      if (options.signal.aborted) return { text: '', aborted: true };
      options.onDelta(this.reduceResponse.slice(index, index + 9));
    }
    return { text: this.reduceResponse, aborted: false };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

describe.skipIf(!HAS_ENV)('chat: whole-document reading', () => {
  let app: INestApplication;
  let llm: ThoroughLlm;
  let documentId: string;
  let partialScanDocumentId: string;

  beforeAll(async () => {
    llm = new ThoroughLlm();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue(llm)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    // A multi-page contract, so the scan is genuinely batched.
    const pages = [0, 1, 2, 3, 4, 5].map((page) => textPage(CLAUSES.slice(page * 16, (page + 1) * 16)));
    const upload = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', buildPdf(pages), 'long.pdf');
    documentId = upload.body.document.id;
    await waitForFinalStatus(app, documentId);

    // The same contract with an unreadable page in the middle.
    const withScan = await request(app.getHttpServer())
      .post('/documents')
      .attach(
        'file',
        buildPdf([textPage(CLAUSES.slice(0, 16)), emptyPage(), textPage(CLAUSES.slice(16))]),
        'partial-scan.pdf',
      );
    partialScanDocumentId = withScan.body.document.id;
    await waitForFinalStatus(app, partialScanDocumentId);
  }, 240_000);

  afterAll(async () => {
    for (const id of [documentId, partialScanDocumentId]) {
      await request(app.getHttpServer()).delete(`/documents/${id}`).catch(() => undefined);
    }
    await app?.close();
  }, 60_000);

  async function askThoroughly(targetDocumentId: string, content: string, mode = 'THOROUGH') {
    const created = await request(app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [targetDocumentId] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/chats/${created.body.id}/messages`)
      .send({ content, mode })
      .expect(200);

    return { ...parseSse(response.text), chatId: created.body.id as string };
  }

  it('reads every section and reports a complete read', async () => {
    llm.failMapCallsFrom = null;
    llm.mapCalls = 0;
    llm.mapQuote = null;
    llm.reduceResponse = `The document sets out numbered obligations.\n${QUOTES_DELIMITER}\n[]`;

    const result = await askThoroughly(documentId, 'List every obligation of the Supplier.');

    expect(result.meta?.mode).toBe('THOROUGH');
    expect(llm.mapCalls).toBeGreaterThan(0);

    const coverage = result.quotes.length >= 0 ? result.meta?.coverage : null;
    expect(coverage).not.toBeNull();
    // Every non-boilerplate section was read.
    expect(result.meta?.coverage.chunksRead).toBe(result.meta?.coverage.chunksTotal);
    expect(result.meta?.coverage.complete).toBe(true);
    expect(result.done?.status).toBe('DONE');
  }, 180_000);

  it('reports real progress while scanning, not a spinner', async () => {
    llm.failMapCallsFrom = null;
    llm.mapCalls = 0;
    llm.reduceResponse = `Scanned.\n${QUOTES_DELIMITER}\n[]`;

    const created = await request(app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [documentId] })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/chats/${created.body.id}/messages`)
      .send({ content: 'List all the duties in this agreement.', mode: 'THOROUGH' })
      .expect(200);

    const progressEvents = response.text
      .split('\n\n')
      .map((block) => block.split('\n').find((line) => line.startsWith('data:')))
      .filter((line): line is string => line !== undefined)
      .map((line) => JSON.parse(line.slice(5).trim()))
      .filter((event: { type: string }) => event.type === 'progress');

    expect(progressEvents.length).toBeGreaterThan(1);
    expect(progressEvents[0]).toMatchObject({ done: 0 });
    const last = progressEvents[progressEvents.length - 1];
    expect(last.done).toBe(last.total);
  }, 180_000);

  it('verifies a quote found during the scan and passes only real ones to the answer', async () => {
    llm.failMapCallsFrom = null;
    llm.mapCalls = 0;
    // A sentence that genuinely exists in the fixture.
    llm.mapQuote = 'This clause 3 obliges the Supplier to perform duty number 3 promptly.';
    llm.reduceResponse =
      `The Supplier must perform duty 3 [1].\n${QUOTES_DELIMITER}\n` +
      JSON.stringify([
        { n: 1, text: 'This clause 3 obliges the Supplier to perform duty number 3 promptly.' },
      ]);

    const result = await askThoroughly(documentId, 'List every duty of the Supplier.');

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]!.status).toBe('VERIFIED');
    expect(result.done?.answerStatus).toBe('ANSWERED');
    // The reduce step is only ever offered verified sentences.
    expect(llm.reducePrompt).toContain('already verified against the document');
  }, 180_000);

  it('discards an invented quote found during the scan', async () => {
    llm.failMapCallsFrom = null;
    llm.mapCalls = 0;
    llm.mapQuote = 'The parties agree to binding arbitration seated in Dubai.';
    llm.reduceResponse = `Nothing was found.\n${QUOTES_DELIMITER}\n[]`;

    const result = await askThoroughly(documentId, 'List all arbitration duties.');

    // It never reaches the reduce step's verified list.
    expect(llm.reducePrompt).not.toContain('binding arbitration seated in Dubai');
    expect(result.quotes).toHaveLength(0);
  }, 180_000);

  it('reports PARTIAL coverage when the scan cannot finish', async () => {
    /**
     * The assignment's worst case, forced. The provider dies part-way, so some sections were
     * never read — the coverage must say so and the answer must not be allowed to claim the
     * document lacks something.
     */
    llm.mapCalls = 0;
    llm.mapQuote = null;
    llm.failMapCallsFrom = 2; // first batch succeeds, then everything fails
    llm.reduceResponse = `Only part of the document was read.\n${QUOTES_DELIMITER}\n[]`;

    const result = await askThoroughly(documentId, 'Is there any arbitration clause at all?');

    const coverage = result.quotes.length >= 0 ? findFinalCoverage(result) : null;
    expect(coverage).not.toBeNull();
    expect(coverage!.complete).toBe(false);
    expect(coverage!.chunksRead).toBeLessThan(coverage!.chunksTotal);
    expect(coverage!.stoppedEarlyReason).toBeTruthy();

    // And the reduce prompt was told it may not claim absence.
    expect(llm.reducePrompt).toContain('did NOT cover the whole document');
  }, 180_000);

  it('is never complete for a document with an unreadable page', async () => {
    // Decision D10: there is text in this document nobody has seen.
    llm.failMapCallsFrom = null;
    llm.mapCalls = 0;
    llm.mapQuote = null;
    llm.reduceResponse = `Read what could be read.\n${QUOTES_DELIMITER}\n[]`;

    const result = await askThoroughly(
      partialScanDocumentId,
      'List every obligation in this agreement.',
    );

    const coverage = findFinalCoverage(result);
    expect(coverage).not.toBeNull();
    expect(coverage!.complete).toBe(false);
    expect(coverage!.skippedPages.length).toBeGreaterThan(0);
    expect(llm.reducePrompt).toContain('no readable text');
  }, 180_000);

  it('persists the thorough coverage so a reopened answer still shows the truth', async () => {
    llm.failMapCallsFrom = 2;
    llm.mapCalls = 0;
    llm.mapQuote = null;
    llm.reduceResponse = `Partial read.\n${QUOTES_DELIMITER}\n[]`;

    const asked = await askThoroughly(documentId, 'List all obligations of both parties.');

    const reloaded = await request(app.getHttpServer()).get(`/chats/${asked.chatId}`).expect(200);
    const assistant = reloaded.body.messages.find((m: { role: string }) => m.role === 'ASSISTANT');

    expect(assistant.mode).toBe('THOROUGH');
    expect(assistant.coverage.complete).toBe(false);
    expect(assistant.coverage.stoppedEarlyReason).toBeTruthy();
  }, 180_000);
});

/** The last coverage the stream reported — the quotes event supersedes meta. */
function findFinalCoverage(result: {
  meta: { coverage: CoverageDto } | null;
  finalCoverage?: CoverageDto | null;
}) {
  return result.finalCoverage ?? result.meta?.coverage ?? null;
}
