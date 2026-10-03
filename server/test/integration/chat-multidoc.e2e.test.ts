import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { QUOTES_DELIMITER, type DocumentCoverageDto } from '@ca/shared';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/core/filters/all-exceptions.filter';
import { LlmService } from '../../src/infrastructure/llm/llm.service';
import { buildPdf, textPage } from '../fixtures/build-pdf';
import { HAS_ENV, waitForFinalStatus } from './harness';
import { ScriptedLlm } from './chat-harness';
import type { INestApplication } from '@nestjs/common';

describe.skipIf(!HAS_ENV)('chat: multi-document questions', () => {
  let app: INestApplication;
  let llm: ScriptedLlm;
  let doc1Id: string;
  let doc2Id: string;
  let chatId: string;

  beforeAll(async () => {
    llm = new ScriptedLlm();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue(llm)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    // Upload Doc 1
    const upload1 = await request(app.getHttpServer())
      .post('/documents')
      .attach(
        'file',
        buildPdf([
          textPage([
            'MASTER SERVICES AGREEMENT V1',
            '1. Limitation of Liability',
            'The total liability of the Supplier shall not exceed AED 100,000 in aggregate.',
            '2. Governing Law',
            'This Agreement is governed by the laws of Dubai.',
          ]),
        ]),
        'msa-v1.pdf',
      );
    doc1Id = upload1.body.document.id;
    await waitForFinalStatus(app, doc1Id);

    // Upload Doc 2
    const upload2 = await request(app.getHttpServer())
      .post('/documents')
      .attach(
        'file',
        buildPdf([
          textPage([
            'COMMERCIAL LEASE AGREEMENT',
            '1. Limitation of Liability',
            'The total liability of the Landlord shall not exceed AED 45,000 in aggregate.',
            '2. Governing Law',
            'This Agreement is governed by the laws of ADGM.',
          ]),
        ]),
        'lease.pdf',
      );
    doc2Id = upload2.body.document.id;
    await waitForFinalStatus(app, doc2Id);

    // Create multi-document chat
    const chatRes = await request(app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [doc1Id, doc2Id] })
      .expect(201);

    chatId = chatRes.body.id;
  }, 180_000);

  afterAll(async () => {
    if (doc1Id) {
      await request(app.getHttpServer()).delete(`/documents/${doc1Id}`).catch(() => undefined);
    }
    if (doc2Id) {
      await request(app.getHttpServer()).delete(`/documents/${doc2Id}`).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
  }, 60_000);

  it('assigns aliases D1 and D2 to the documents in chat order', async () => {
    const chat = await request(app.getHttpServer()).get(`/chats/${chatId}`).expect(200);
    expect(chat.body.documents).toHaveLength(2);
    expect(chat.body.documents[0].alias).toBe('D1');
    expect(chat.body.documents[0].documentId).toBe(doc1Id);
    expect(chat.body.documents[1].alias).toBe('D2');
    expect(chat.body.documents[1].documentId).toBe(doc2Id);
  });

  it('answers comparatively and verifies quotes against their respective documents', async () => {
    llm.script(
      'Comparing liability caps: MSA v1 is AED 100,000 [1], whereas Lease is AED 45,000 [2].\n' +
        `${QUOTES_DELIMITER}\n` +
        JSON.stringify([
          { n: 1, doc: 'D1', text: 'The total liability of the Supplier shall not exceed AED 100,000 in aggregate.' },
          { n: 2, doc: 'D2', text: 'The total liability of the Landlord shall not exceed AED 45,000 in aggregate.' },
        ]),
    );

    const response = await request(app.getHttpServer())
      .post(`/chats/${chatId}/messages`)
      .send({ content: 'Compare the liability caps in both contracts' })
      .expect(200);

    // Parse SSE events
    const blocks = response.text.split('\n\n');
    let metaEvent: any = null;
    let quotesEvent: any = null;
    let doneEvent: any = null;

    for (const block of blocks) {
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim());
      if (event.type === 'meta') metaEvent = event;
      if (event.type === 'quotes') quotesEvent = event;
      if (event.type === 'done') doneEvent = event;
    }

    expect(metaEvent).toBeDefined();
    expect(metaEvent.documentCoverage).toHaveLength(2);
    expect(metaEvent.documentCoverage[0].alias).toBe('D1');
    expect(metaEvent.documentCoverage[1].alias).toBe('D2');

    expect(quotesEvent).toBeDefined();
    expect(quotesEvent.quotes).toHaveLength(2);

    // Quote 1 verified against D1
    expect(quotesEvent.quotes[0].status).toBe('VERIFIED');
    expect(quotesEvent.quotes[0].documentId).toBe(doc1Id);

    // Quote 2 verified against D2
    expect(quotesEvent.quotes[1].status).toBe('VERIFIED');
    expect(quotesEvent.quotes[1].documentId).toBe(doc2Id);

    expect(doneEvent?.status).toBe('DONE');
    expect(doneEvent?.answerStatus).toBe('ANSWERED');
  });

  it('rejects a quote as UNVERIFIED if attributed to the wrong document alias', async () => {
    // Quote from D1 ("Supplier shall not exceed AED 100,000") falsely attributed to D2
    llm.script(
      'The lease cap is AED 100,000 [1].\n' +
        `${QUOTES_DELIMITER}\n` +
        JSON.stringify([
          { n: 1, doc: 'D2', text: 'The total liability of the Supplier shall not exceed AED 100,000 in aggregate.' },
        ]),
    );

    const response = await request(app.getHttpServer())
      .post(`/chats/${chatId}/messages`)
      .send({ content: 'What is the liability cap under the lease?' })
      .expect(200);

    const blocks = response.text.split('\n\n');
    let quotesEvent: any = null;

    for (const block of blocks) {
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim());
      if (event.type === 'quotes') quotesEvent = event;
    }

    expect(quotesEvent).toBeDefined();
    expect(quotesEvent.quotes).toHaveLength(1);
    expect(quotesEvent.quotes[0].status).toBe('UNVERIFIED');
    expect(quotesEvent.quotes[0].documentId).toBeNull();
  });

  it('persists documentCoverage so a reloaded multi-document chat shows per-document coverage', async () => {
    const chat = await request(app.getHttpServer()).get(`/chats/${chatId}`).expect(200);
    const lastMessage = chat.body.messages[chat.body.messages.length - 1];

    expect(lastMessage.documentCoverage).toHaveLength(2);
    const d1Coverage: DocumentCoverageDto = lastMessage.documentCoverage.find((d: any) => d.alias === 'D1');
    const d2Coverage: DocumentCoverageDto = lastMessage.documentCoverage.find((d: any) => d.alias === 'D2');

    expect(d1Coverage).toBeDefined();
    expect(d2Coverage).toBeDefined();
    expect(d1Coverage.coverage.chunksTotal).toBeGreaterThan(0);
    expect(d2Coverage.coverage.chunksTotal).toBeGreaterThan(0);
  });
});
