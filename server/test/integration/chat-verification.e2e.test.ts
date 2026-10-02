import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUOTES_DELIMITER } from '@ca/shared';
import { createChatFixture, HAS_ENV_CHAT, type ChatFixture } from './chat-harness';

/**
 * Quote verification through the whole chat pipeline — the assignment's central requirement.
 *
 * These cases cannot be tested against a live model: a real model usually quotes correctly,
 * so the dangerous path — an invented quote presented as genuine — would never be exercised.
 * The model is therefore scripted to misbehave on purpose.
 */
describe.skipIf(!HAS_ENV_CHAT)('chat: quote verification', () => {
  let fixture: ChatFixture;

  beforeAll(async () => {
    fixture = await createChatFixture();
  }, 180_000);

  afterAll(async () => {
    await fixture?.close();
  }, 60_000);

  describe('a genuine quote', () => {
    it('is VERIFIED and carries offsets into the document', async () => {
      fixture.llm.script(
        `The cap is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
          '[{"n":1,"text":"The total liability of the Supplier shall not exceed AED 250,000 in aggregate."}]',
      );

      const result = await fixture.ask('What is the liability cap?');

      expect(result.answer).toBe('The cap is AED 250,000 [1].');
      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]!.status).toBe('VERIFIED');
      expect(result.quotes[0]!.matchKind).toBe('EXACT_WS');
      expect(result.quotes[0]!.matches).toHaveLength(1);
      expect(result.quotes[0]!.documentId).toBe(fixture.documentId);
      expect(result.done?.answerStatus).toBe('ANSWERED');
    });

    it('is VERIFIED when only the whitespace differs', async () => {
      // Extraction noise, not a different quote.
      fixture.llm.script(
        `The cap is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([
            { n: 1, text: 'The total liability of the Supplier\nshall not exceed    AED 250,000' },
          ]),
      );

      const result = await fixture.ask('What is the total liability of the Supplier?');

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]!.status).toBe('VERIFIED');
    });

    it('is VERIFIED with a note when only the capitalisation differs', async () => {
      // Decision D6: the words are identical, so this is a real quote — flagged, not rejected.
      fixture.llm.script(
        `The cap is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([
            { n: 1, text: 'THE TOTAL LIABILITY OF THE SUPPLIER SHALL NOT EXCEED AED 250,000' },
          ]),
      );

      const result = await fixture.ask('What is the total liability of the Supplier?');

      expect(result.quotes[0]!.status).toBe('VERIFIED');
      expect(result.quotes[0]!.matchKind).toBe('CASE_INSENSITIVE');
    });
  });

  describe('an invented quote', () => {
    it('is UNVERIFIED and never presented as genuine', async () => {
      /**
       * THE test for this application. A model that invents a plausible-sounding quote must
       * not have it shown as a quotation, and the answer must not be counted as supported.
       */
      fixture.llm.script(
        `The cap is AED 5,000,000 [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([
            {
              n: 1,
              text: 'The total liability of the Supplier shall not exceed AED 5,000,000 in aggregate.',
            },
          ]),
      );

      const result = await fixture.ask('What is the liability cap?');

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]!.status).toBe('UNVERIFIED');
      expect(result.quotes[0]!.matches).toHaveLength(0);
      expect(result.quotes[0]!.matchKind).toBeNull();
      // No document id, so the UI cannot make it clickable even by mistake.
      expect(result.quotes[0]!.documentId).toBeNull();
      expect(result.done?.answerStatus).toBe('UNSUPPORTED');
    });

    it('is kept and shown as unverified rather than silently dropped', async () => {
      // Dropping it would leave the [1] marker pointing at nothing and hide the invention.
      fixture.llm.script(
        `Invented claim [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([{ n: 1, text: 'a sentence that is nowhere in this contract at all' }]),
      );

      const result = await fixture.ask('What does the agreement say about liability?');

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]!.text).toContain('nowhere in this contract');
      expect(result.quotes[0]!.status).toBe('UNVERIFIED');
    });

    it('rejects a paraphrase of a real sentence', async () => {
      fixture.llm.script(
        `The cap is AED 250,000 [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([
            { n: 1, text: 'The Supplier’s liability is limited to AED 250,000 overall.' },
          ]),
      );

      const result = await fixture.ask('What is the total liability of the Supplier?');
      expect(result.quotes[0]!.status).toBe('UNVERIFIED');
    });

    it('keeps the verified quote and rejects the invented one in the same answer', async () => {
      fixture.llm.script(
        `Two claims [1][2].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([
            { n: 1, text: 'Either party may terminate on 60 days written notice.' },
            { n: 2, text: 'Either party may terminate immediately for any reason.' },
          ]),
      );

      const result = await fixture.ask('How can this be terminated?');

      expect(result.quotes.map((quote) => quote.status)).toEqual(['VERIFIED', 'UNVERIFIED']);
      // One verified quote is enough for the answer to count as supported.
      expect(result.done?.answerStatus).toBe('ANSWERED');
    });

    it('rejects a quote with one number changed', async () => {
      fixture.llm.script(
        `Notice is 90 days [1].\n${QUOTES_DELIMITER}\n` +
          JSON.stringify([{ n: 1, text: 'Either party may terminate on 90 days written notice.' }]),
      );

      const result = await fixture.ask('What notice is needed to terminate?');
      expect(result.quotes[0]!.status).toBe('UNVERIFIED');
    });
  });
});
