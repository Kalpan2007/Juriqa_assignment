import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import path from 'node:path';
import dotenv from 'dotenv';
import type { CoverageDto } from '@ca/shared';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/core/filters/all-exceptions.filter';
import { LlmService, type StreamOptions } from '../../src/infrastructure/llm/llm.service';
import { buildPdf, textPage } from '../fixtures/build-pdf';
import { HAS_ENV, waitForFinalStatus } from './harness';

/** Re-exported so each chat suite can skip itself when the environment is not configured. */
export const HAS_ENV_CHAT = HAS_ENV;

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Shared setup for the chat suites, with the LLM MOCKED (ARCHITECTURE section 14).
 *
 * Mocking is what makes these tests meaningful rather than flaky. What is being checked is
 * OUR response to what a model says, and the interesting cases — an invented quote, a missing
 * delimiter, malformed JSON — are ones a real model produces only occasionally. A live model
 * usually quotes correctly, so the dangerous paths would never be exercised at all.
 *
 * Each FILE builds its own application, which also gives it a fresh throttle budget, so the
 * suites stay under the real 10/min message limit without disabling the guard.
 */

/** The contract the scripted answers refer to. Its exact wording matters. */
export const CONTRACT_LINES = [
  'SERVICES AGREEMENT',
  'This Agreement is made between Alpha FZ-LLC and Beta DMCC.',
  '1. Limitation of Liability',
  'The total liability of the Supplier shall not exceed AED 250,000 in aggregate.',
  '2. Term and Termination',
  'Either party may terminate on 60 days written notice.',
  '3. Governing Law',
  'This Agreement is governed by the laws of the DIFC.',
];

/** A scripted LLM: each call returns the next response, streamed in small pieces. */
export class ScriptedLlm {
  private responses: string[] = [];
  lastPrompt = '';

  script(...responses: string[]): void {
    this.responses = [...responses];
  }

  async stream(options: StreamOptions): Promise<{ text: string; aborted: boolean }> {
    this.lastPrompt = options.messages.map((message) => message.content).join('\n---\n');
    const response = this.responses.shift() ?? 'No scripted response.';

    // Streamed in pieces, so the parser's chunk handling is exercised rather than bypassed.
    for (let index = 0; index < response.length; index += 7) {
      if (options.signal.aborted) return { text: response.slice(0, index), aborted: true };
      options.onDelta(response.slice(index, index + 7));
    }
    return { text: response, aborted: false };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

export interface ParsedStream {
  answer: string;
  /**
   * The coverage from the LAST event that carried one.
   *
   * This matters for a thorough read: `meta` carries an optimistic estimate built before the
   * scan runs, and the `quotes` event replaces it with what was ACTUALLY read. A test (or a
   * UI) that looked only at `meta` would report a partial scan as complete.
   */
  finalCoverage: CoverageDto | null;
  quotes: Array<{
    citation: number;
    status: string;
    text: string;
    matchKind: string | null;
    matches: unknown[];
    documentId: string | null;
  }>;
  done: { status: string; answerStatus: string | null } | null;
  notices: Array<{ code: string; message: string }>;
  meta: {
    mode: string;
    coverage: CoverageDto;
  } | null;
}

export function parseSse(raw: string): ParsedStream {
  const result: ParsedStream = {
    answer: '',
    quotes: [],
    done: null,
    notices: [],
    meta: null,
    finalCoverage: null,
  };

  for (const block of raw.split('\n\n')) {
    const line = block.split('\n').find((candidate) => candidate.startsWith('data:'));
    if (line === undefined) continue;
    const event = JSON.parse(line.slice(5).trim());

    if (event.type === 'delta') result.answer += event.text;
    if (event.type === 'quotes') result.quotes = event.quotes;
    if (event.type === 'done' && result.done === null) result.done = event;
    if (event.type === 'notice') result.notices.push(event);
    if (event.type === 'meta') {
      result.meta = event;
      result.finalCoverage = event.coverage ?? result.finalCoverage;
    }
    if (event.type === 'quotes' && event.coverage) result.finalCoverage = event.coverage;
  }
  return result;
}

export interface ChatFixture {
  app: INestApplication;
  llm: ScriptedLlm;
  documentId: string;
  ask: (content: string) => Promise<ParsedStream & { chatId: string }>;
  close: () => Promise<void>;
}

export async function createChatFixture(): Promise<ChatFixture> {
  const llm = new ScriptedLlm();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LlmService)
    .useValue(llm)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const upload = await request(app.getHttpServer())
    .post('/documents')
    .attach('file', buildPdf([textPage(CONTRACT_LINES)]), 'services.pdf');
  const documentId: string = upload.body.document.id;
  await waitForFinalStatus(app, documentId);

  async function ask(content: string) {
    const created = await request(app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [documentId] })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/chats/${created.body.id}/messages`)
      .send({ content })
      .expect(200);

    return { ...parseSse(response.text), chatId: created.body.id as string };
  }

  async function close() {
    await request(app.getHttpServer())
      .delete(`/documents/${documentId}`)
      .catch(() => undefined);
    await app.close();
  }

  return { app, llm, documentId, ask, close };
}
