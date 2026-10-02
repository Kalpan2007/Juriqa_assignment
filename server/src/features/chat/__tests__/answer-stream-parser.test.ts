import { describe, expect, it } from 'vitest';
import { QUOTES_DELIMITER } from '@ca/shared';
import { AnswerStreamParser } from '../domain/answer-stream-parser';

/** Feeds a whole response through the parser in fixed-size pieces. */
function streamIn(text: string, chunkSize: number) {
  const parser = new AnswerStreamParser();
  let emitted = '';

  for (let index = 0; index < text.length; index += chunkSize) {
    emitted += parser.push(text.slice(index, index + chunkSize)).delta;
  }
  const final = parser.finish();
  return { emitted: emitted + final.delta, ...final };
}

const RESPONSE = [
  'The liability cap is AED 100,000 in aggregate [1].',
  QUOTES_DELIMITER,
  '[{"n":1,"text":"shall not exceed AED 100,000 in aggregate"}]',
].join('\n');

describe('AnswerStreamParser — the delimiter', () => {
  it('splits the answer from the quote JSON', () => {
    const result = streamIn(RESPONSE, 1_000);

    expect(result.answerText).toBe('The liability cap is AED 100,000 in aggregate [1].');
    expect(result.quotesText.trim()).toBe(
      '[{"n":1,"text":"shall not exceed AED 100,000 in aggregate"}]',
    );
    expect(result.sawDelimiter).toBe(true);
  });

  it('never leaks the delimiter into the visible answer', () => {
    // The failure this guards: the user reads "---QUOTES---" in the middle of their answer.
    for (const chunkSize of [1, 2, 3, 5, 7, 11, 13, 50]) {
      const result = streamIn(RESPONSE, chunkSize);
      expect(result.emitted, `chunk size ${chunkSize}`).not.toContain(QUOTES_DELIMITER);
      expect(result.emitted, `chunk size ${chunkSize}`).not.toContain('---');
    }
  });

  it('finds a delimiter split across chunks, at EVERY split point', () => {
    /**
     * The core property. Tokens arrive in arbitrary pieces, so the delimiter can be broken
     * at any character. Each split is tested individually: a parser that only held back a
     * few characters would pass the common cases and fail at the worst one.
     */
    for (let split = 1; split < QUOTES_DELIMITER.length; split += 1) {
      const parser = new AnswerStreamParser();
      let emitted = '';

      emitted += parser.push('Answer text here.\n').delta;
      emitted += parser.push(QUOTES_DELIMITER.slice(0, split)).delta;
      emitted += parser.push(QUOTES_DELIMITER.slice(split)).delta;
      emitted += parser.push('\n[{"n":1,"text":"quoted text"}]').delta;
      const final = parser.finish();

      expect(final.sawDelimiter, `split at ${split}`).toBe(true);
      expect(emitted + final.delta, `split at ${split}`).toBe('Answer text here.');
      expect(final.quotesText.trim(), `split at ${split}`).toBe('[{"n":1,"text":"quoted text"}]');
    }
  });

  it('emits text as it arrives rather than waiting for the end', () => {
    // The assignment requires answers to stream, not appear all at once.
    const parser = new AnswerStreamParser();
    const first = parser.push('The liability cap is a limit on ');
    const second = parser.push('how much a party can owe. ');

    expect(first.delta.length).toBeGreaterThan(0);
    expect(second.delta.length).toBeGreaterThan(0);
  });

  it('holds back only a bounded amount', () => {
    // Holding back more than the delimiter length would make streaming visibly laggy.
    const parser = new AnswerStreamParser();
    const text = 'a'.repeat(500);
    const { delta } = parser.push(text);

    expect(text.length - delta.length).toBeLessThan(QUOTES_DELIMITER.length);
  });
});

describe('AnswerStreamParser — when the model misbehaves', () => {
  it('treats everything as the answer when the delimiter never arrives', () => {
    const result = streamIn('Just an answer with no delimiter at all.', 7);

    expect(result.sawDelimiter).toBe(false);
    expect(result.answerText).toBe('Just an answer with no delimiter at all.');
    expect(result.quotesText).toBe('');
  });

  it('emits the held-back tail on finish', () => {
    // Without this, the last few characters of every answer would be silently dropped.
    const parser = new AnswerStreamParser();
    const pushed = parser.push('Short.').delta;
    const final = parser.finish();

    expect(pushed + final.delta).toBe('Short.');
  });

  it('handles a delimiter with nothing after it', () => {
    const result = streamIn(`An answer.\n${QUOTES_DELIMITER}`, 4);

    expect(result.sawDelimiter).toBe(true);
    expect(result.answerText).toBe('An answer.');
    expect(result.quotesText.trim()).toBe('');
  });

  it('handles a delimiter with nothing before it', () => {
    const result = streamIn(`${QUOTES_DELIMITER}\n[{"n":1,"text":"only a quote"}]`, 5);

    expect(result.answerText).toBe('');
    expect(result.quotesText).toContain('only a quote');
  });

  it('keeps only the FIRST delimiter as the boundary', () => {
    // A second occurrence inside the JSON must not restart the split.
    const result = streamIn(
      `Answer.\n${QUOTES_DELIMITER}\n[{"n":1,"text":"mentions ${QUOTES_DELIMITER} oddly"}]`,
      6,
    );

    expect(result.answerText).toBe('Answer.');
    expect(result.quotesText).toContain(QUOTES_DELIMITER);
  });

  it('handles an empty stream', () => {
    const parser = new AnswerStreamParser();
    const final = parser.finish();

    expect(final.answerText).toBe('');
    expect(final.sawDelimiter).toBe(false);
  });

  it('handles empty chunks', () => {
    const parser = new AnswerStreamParser();
    parser.push('');
    parser.push('Text');
    parser.push('');
    const final = parser.finish();

    expect(final.answerText).toBe('Text');
  });
});

describe('AnswerStreamParser — Stop', () => {
  it('exposes the partial answer at any point', () => {
    // What gets persisted when the user presses Stop mid-sentence.
    const parser = new AnswerStreamParser();
    parser.push('The liability cap is ');
    parser.push('AED 100,');

    expect(parser.currentAnswer).toBe('The liability cap is AED 100,');
  });

  it('includes held-back characters in the partial answer', () => {
    const parser = new AnswerStreamParser();
    parser.push('abc');

    // Even though some characters are held back from the stream, they are part of the answer.
    expect(parser.currentAnswer).toBe('abc');
  });
});

describe('AnswerStreamParser — a realistic long answer', () => {
  it('reassembles exactly, whatever the chunk boundaries', () => {
    const answer = [
      'The agreement caps liability at AED 100,000 in aggregate [1].',
      '',
      'Separately, the governing law is that of the DIFC [2]. Note that the cap does not',
      'apply to fraud or wilful misconduct [3].',
    ].join('\n');
    const payload = JSON.stringify([
      { n: 1, text: 'shall not exceed AED 100,000 in aggregate' },
      { n: 2, text: 'governed by the laws of the DIFC' },
      { n: 3, text: 'Nothing limits liability for fraud' },
    ]);
    const response = `${answer}\n${QUOTES_DELIMITER}\n${payload}`;

    for (const chunkSize of [1, 3, 17, 64, 9_999]) {
      const result = streamIn(response, chunkSize);
      expect(result.answerText, `chunk size ${chunkSize}`).toBe(answer);
      expect(JSON.parse(result.quotesText), `chunk size ${chunkSize}`).toHaveLength(3);
    }
  });
});
