import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUOTES_DELIMITER } from '@ca/shared';
import { createChatFixture, HAS_ENV_CHAT, type ChatFixture } from './chat-harness';

/**
 * What happens when the model does not follow the format.
 *
 * None of these may take an answer down, and none may let unverified text be presented as a
 * quotation. A model that ignores the quote instruction produces an answer with no support —
 * which is a real outcome, reported honestly, not an error.
 */
describe.skipIf(!HAS_ENV_CHAT)('chat: malformed model output', () => {
  let fixture: ChatFixture;
  const QUESTION = 'What is the total liability of the Supplier?';

  beforeAll(async () => {
    fixture = await createChatFixture();
  }, 180_000);

  afterAll(async () => {
    await fixture?.close();
  }, 60_000);

  it('treats a missing delimiter as an answer with no quotes', async () => {
    // Observed with the real model on a verbose question: a complete answer, no quote block.
    fixture.llm.script('The liability is AED 250,000, I am fairly sure.');

    const result = await fixture.ask(QUESTION);

    expect(result.answer).toBe('The liability is AED 250,000, I am fairly sure.');
    expect(result.quotes).toHaveLength(0);
    // Nothing verified, so the answer carries the warning rather than looking supported.
    expect(result.done?.answerStatus).toBe('UNSUPPORTED');
  });

  it('emits a notice and no quotes when the JSON is unreadable', async () => {
    fixture.llm.script(`An answer [1].\n${QUOTES_DELIMITER}\nthis is not JSON at all {{{`);

    const result = await fixture.ask(QUESTION);

    expect(result.quotes).toHaveLength(0);
    expect(result.notices.some((notice) => notice.code === 'LLM_INVALID_RESPONSE')).toBe(true);
    // A broken payload must not fail the request.
    expect(result.done?.status).toBe('DONE');
  });

  it('recovers quotes from a markdown code fence', async () => {
    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
        '```json\n[{"n":1,"text":"shall not exceed AED 250,000 in aggregate"}]\n```',
    );

    const result = await fixture.ask(QUESTION);
    expect(result.quotes[0]!.status).toBe('VERIFIED');
  });

  it('recovers quotes wrapped in an object', async () => {
    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
        '{"quotes":[{"n":1,"text":"shall not exceed AED 250,000 in aggregate"}]}',
    );

    const result = await fixture.ask(QUESTION);
    expect(result.quotes[0]!.status).toBe('VERIFIED');
  });

  it('never leaks the delimiter into the answer text', async () => {
    fixture.llm.script(
      `The liability is AED 250,000 [1].\n${QUOTES_DELIMITER}\n[{"n":1,"text":"AED 250,000 in aggregate"}]`,
    );

    const result = await fixture.ask(QUESTION);

    expect(result.answer).not.toContain(QUOTES_DELIMITER);
    expect(result.answer).not.toContain('---');
    expect(result.answer).toBe('The liability is AED 250,000 [1].');
  });

  it('drops a duplicate quote repeated under two numbers', async () => {
    // Showing it twice would make the answer look better supported than it is.
    fixture.llm.script(
      `Claim [1][2].\n${QUOTES_DELIMITER}\n` +
        '[{"n":1,"text":"governed by the laws of the DIFC"},{"n":2,"text":"governed by the laws of the DIFC"}]',
    );

    const result = await fixture.ask('Which law governs the agreement?');
    expect(result.quotes).toHaveLength(1);
  });

  it('is NOT_FOUND when the model honestly says it cannot answer', async () => {
    fixture.llm.script(`The excerpts do not mention the CEO salary.\n${QUOTES_DELIMITER}\n[]`);

    const result = await fixture.ask('What liability does the CEO salary create?');

    expect(result.done?.answerStatus).toBe('NOT_FOUND');
    expect(result.quotes).toHaveLength(0);
  });

  it('says nothing was found, scoped to what was searched, when retrieval matches nothing', async () => {
    /**
     * A question sharing no vocabulary with the document never reaches the model at all.
     * The wording matters: it must say nothing relevant was found in the sections REVIEWED,
     * not that the document does not contain it — only part of it was searched.
     */
    fixture.llm.script('this response should never be used');

    const result = await fixture.ask('Who won the football match on Saturday?');

    expect(result.done?.answerStatus).toBe('NOT_FOUND');
    expect(result.quotes).toHaveLength(0);
    expect(result.answer.toLowerCase()).toContain('nothing relevant');
  });
});
