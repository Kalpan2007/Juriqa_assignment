import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { QUOTES_DELIMITER } from '@ca/shared';
import { createChatFixture, HAS_ENV_CHAT, parseSse, type ChatFixture } from './chat-harness';

/**
 * Chats are saved per document and can be reopened (assignment A2), with their coverage and
 * verified quotes intact — a reopened answer must show exactly what it showed when written.
 */
describe.skipIf(!HAS_ENV_CHAT)('chat: persistence, history and coverage', () => {
  let fixture: ChatFixture;

  beforeAll(async () => {
    fixture = await createChatFixture();
  }, 180_000);

  afterAll(async () => {
    await fixture?.close();
  }, 60_000);

  it('persists text, status, quotes and coverage', async () => {
    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
        '[{"n":1,"text":"The total liability of the Supplier shall not exceed AED 250,000 in aggregate."}]',
    );
    const asked = await fixture.ask('What is the total liability of the Supplier?');

    const reloaded = await request(fixture.app.getHttpServer())
      .get(`/chats/${asked.chatId}`)
      .expect(200);

    const assistant = reloaded.body.messages.find((m: { role: string }) => m.role === 'ASSISTANT');

    expect(assistant.content).toBe('The liability is AED 250,000 [1].');
    expect(assistant.status).toBe('DONE');
    expect(assistant.answerStatus).toBe('ANSWERED');
    expect(assistant.quotes).toHaveLength(1);
    expect(assistant.quotes[0].status).toBe('VERIFIED');
    // The offsets must survive, or a reopened chat's quote chips could not be clicked.
    expect(assistant.quotes[0].matches).toHaveLength(1);
    expect(assistant.coverage).not.toBeNull();
    expect(assistant.coverage.chunksTotal).toBeGreaterThan(0);
  });

  it('keeps an unverified quote unverified after a reload', async () => {
    fixture.llm.script(
      `Invented [1].\n${QUOTES_DELIMITER}\n[{"n":1,"text":"a liability sentence not present in this contract"}]`,
    );
    const asked = await fixture.ask('What does it say about liability?');

    const reloaded = await request(fixture.app.getHttpServer())
      .get(`/chats/${asked.chatId}`)
      .expect(200);
    const assistant = reloaded.body.messages.find((m: { role: string }) => m.role === 'ASSISTANT');

    expect(assistant.quotes[0].status).toBe('UNVERIFIED');
    expect(assistant.quotes[0].matches).toHaveLength(0);
    expect(assistant.answerStatus).toBe('UNSUPPORTED');
  });

  it('sets the chat title from the first question', async () => {
    fixture.llm.script(`An answer.\n${QUOTES_DELIMITER}\n[]`);
    const asked = await fixture.ask('What is the governing law of this agreement?');

    const reloaded = await request(fixture.app.getHttpServer())
      .get(`/chats/${asked.chatId}`)
      .expect(200);

    expect(reloaded.body.title).toBe('What is the governing law of this agreement?');
  });

  it('lists chats under their document, most recent first', async () => {
    fixture.llm.script(`First.\n${QUOTES_DELIMITER}\n[]`, `Second.\n${QUOTES_DELIMITER}\n[]`);
    const first = await fixture.ask('A question about liability for the history list.');
    const second = await fixture.ask('Another question about termination for the list.');

    const list = await request(fixture.app.getHttpServer())
      .get(`/documents/${fixture.documentId}/chats`)
      .expect(200);

    const ids = list.body.chats.map((chat: { id: string }) => chat.id);
    expect(ids).toContain(first.chatId);
    expect(ids).toContain(second.chatId);
    // Ordered by updatedAt, so the newest conversation is at the top (decision D21).
    expect(ids.indexOf(second.chatId)).toBeLessThan(ids.indexOf(first.chatId));
  });

  it('uses earlier turns for a follow-up, without their excerpts or markers', async () => {
    const created = await request(fixture.app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [fixture.documentId] })
      .expect(201);
    const chatId = created.body.id;

    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n[{"n":1,"text":"AED 250,000 in aggregate"}]`,
      `Notice is 60 days [1].\n${QUOTES_DELIMITER}\n[{"n":1,"text":"terminate on 60 days written notice"}]`,
    );

    await request(fixture.app.getHttpServer())
      .post(`/chats/${chatId}/messages`)
      .send({ content: 'What is the total liability of the Supplier?' })
      .expect(200);

    const second = await request(fixture.app.getHttpServer())
      .post(`/chats/${chatId}/messages`)
      .send({ content: 'and the notice to terminate?' })
      .expect(200);

    // The previous question is in the prompt, so a short follow-up has context...
    expect(fixture.llm.lastPrompt).toContain('What is the total liability of the Supplier?');
    // ...but its citation markers are stripped, so the model cannot reuse stale numbering.
    expect(fixture.llm.lastPrompt).not.toContain('AED 250,000 [1]');

    expect(parseSse(second.text).done?.answerStatus).toBe('ANSWERED');

    const reloaded = await request(fixture.app.getHttpServer()).get(`/chats/${chatId}`).expect(200);
    expect(reloaded.body.messages).toHaveLength(4);
  });

  it('escalates an absence question to a whole-document read', async () => {
    fixture.llm.script(`There is no arbitration clause.\n${QUOTES_DELIMITER}\n[]`);

    const result = await fixture.ask('Is there an arbitration clause about liability?');

    // The classifier must not let an absence question be answered from a partial read.
    expect(result.meta?.mode).toBe('THOROUGH');
  });

  it('uses retrieval for a specific question', async () => {
    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n[{"n":1,"text":"AED 250,000 in aggregate"}]`,
    );

    const result = await fixture.ask('What is the total liability of the Supplier?');
    expect(result.meta?.mode).toBe('RETRIEVAL');
  });

  it('deletes a chat', async () => {
    fixture.llm.script(`An answer about liability.\n${QUOTES_DELIMITER}\n[]`);
    const asked = await fixture.ask('A liability question to delete.');

    await request(fixture.app.getHttpServer()).delete(`/chats/${asked.chatId}`).expect(204);
    await request(fixture.app.getHttpServer()).get(`/chats/${asked.chatId}`).expect(404);
  });
});

describe.skipIf(!HAS_ENV_CHAT)('chat: validation', () => {
  let fixture: ChatFixture;

  beforeAll(async () => {
    fixture = await createChatFixture();
  }, 180_000);

  afterAll(async () => {
    await fixture?.close();
  }, 60_000);

  it('rejects an empty question', async () => {
    const created = await request(fixture.app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [fixture.documentId] })
      .expect(201);

    const response = await request(fixture.app.getHttpServer())
      .post(`/chats/${created.body.id}/messages`)
      .send({ content: '   ' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a chat with no documents', async () => {
    const response = await request(fixture.app.getHttpServer())
      .post('/chats')
      .send({ documentIds: [] })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects more than five documents', async () => {
    const ids = Array.from({ length: 6 }, () => fixture.documentId);
    const response = await request(fixture.app.getHttpServer())
      .post('/chats')
      .send({ documentIds: ids })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('404s for a chat that does not exist', async () => {
    await request(fixture.app.getHttpServer())
      .get('/chats/3f6b0c1e-9a2d-4c5e-8f7a-1b2c3d4e5f60')
      .expect(404);
  });

  it('400s for a chat id that is not a uuid', async () => {
    await request(fixture.app.getHttpServer()).get('/chats/not-a-uuid').expect(400);
  });
});
