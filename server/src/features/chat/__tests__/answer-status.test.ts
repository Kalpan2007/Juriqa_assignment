import { describe, expect, it } from 'vitest';
import type { QuoteDto } from '@ca/shared';
import { deriveAnswerStatus, looksLikeNotFound, shouldWarnUnsupported } from '../domain/answer-status';
import { buildHistoryText, previousUserQuestion } from '../domain/history-builder';

function quote(status: 'VERIFIED' | 'UNVERIFIED', citation = 1): QuoteDto {
  return {
    id: `q${citation}`,
    citation,
    text: 'some quoted text from the document',
    status,
    documentId: '3f6b0c1e-9a2d-4c5e-8f7a-1b2c3d4e5f60',
    documentName: 'contract.pdf',
    matches: status === 'VERIFIED' ? [{ start: 10, end: 44 }] : [],
    matchKind: status === 'VERIFIED' ? 'EXACT_WS' : null,
  };
}

describe('deriveAnswerStatus', () => {
  it('is ANSWERED when at least one quote verified', () => {
    expect(
      deriveAnswerStatus({
        messageStatus: 'DONE',
        answerText: 'The cap is AED 100,000 [1].',
        quotes: [quote('VERIFIED')],
      }),
    ).toBe('ANSWERED');
  });

  it('is ANSWERED even if some quotes failed, as long as one held', () => {
    expect(
      deriveAnswerStatus({
        messageStatus: 'DONE',
        answerText: 'The cap is AED 100,000 [1][2].',
        quotes: [quote('VERIFIED', 1), quote('UNVERIFIED', 2)],
      }),
    ).toBe('ANSWERED');
  });

  it('is UNSUPPORTED when there is an answer but nothing verified', () => {
    /**
     * The most dangerous output this app can produce: a fluent, confident answer with
     * nothing behind it. It gets the amber banner.
     */
    expect(
      deriveAnswerStatus({
        messageStatus: 'DONE',
        answerText: 'The cap is AED 5,000,000 and the term is perpetual.',
        quotes: [quote('UNVERIFIED')],
      }),
    ).toBe('UNSUPPORTED');
  });

  it('is UNSUPPORTED when the model supplied no quotes at all', () => {
    expect(
      deriveAnswerStatus({
        messageStatus: 'DONE',
        answerText: 'The liability cap is AED 100,000.',
        quotes: [],
      }),
    ).toBe('UNSUPPORTED');
  });

  it('is NOT_FOUND when the model said so, which is honest rather than a failure', () => {
    expect(
      deriveAnswerStatus({
        messageStatus: 'DONE',
        answerText: 'The reviewed sections do not mention the CEO’s salary.',
        quotes: [],
      }),
    ).toBe('NOT_FOUND');
  });

  it('is PARTIAL when the user pressed Stop, NEVER unsupported', () => {
    /**
     * Decision D11, and the reason this module exists. Quotes are emitted last, so a stopped
     * answer almost always has none — classifying it UNSUPPORTED would accuse the app of
     * making something up when the user simply interrupted it.
     */
    const status = deriveAnswerStatus({
      messageStatus: 'STOPPED',
      answerText: 'The liability cap is AED 100,',
      quotes: [],
    });

    expect(status).toBe('PARTIAL');
    expect(shouldWarnUnsupported(status)).toBe(false);
  });

  it('is PARTIAL on Stop even when the text looks like a complete answer', () => {
    expect(
      deriveAnswerStatus({
        messageStatus: 'STOPPED',
        answerText: 'The liability cap is AED 100,000 in aggregate.',
        quotes: [],
      }),
    ).toBe('PARTIAL');
  });

  it('has no status for a failed request', () => {
    expect(
      deriveAnswerStatus({ messageStatus: 'ERROR', answerText: '', quotes: [] }),
    ).toBeNull();
  });

  it('has no status while still streaming', () => {
    expect(
      deriveAnswerStatus({ messageStatus: 'STREAMING', answerText: 'partial', quotes: [] }),
    ).toBeNull();
  });

  it('has no status for an empty completed answer', () => {
    expect(deriveAnswerStatus({ messageStatus: 'DONE', answerText: '   ', quotes: [] })).toBeNull();
  });
});

describe('looksLikeNotFound', () => {
  it.each([
    'The answer is not found in the reviewed sections.',
    'This is not mentioned in the excerpts provided.',
    'I could not find any reference to that.',
    'The document does not specify a sub-limit.',
    'There is no information about the CEO salary in these sections.',
    'The excerpts provided do not contain an answer.',
  ])('recognises %j', (text) => {
    expect(looksLikeNotFound(text)).toBe(true);
  });

  it('does NOT treat a trailing caveat as a not-found answer', () => {
    /**
     * The failure this prevents: a good answer ending with a qualification would be
     * classified NOT_FOUND and its verified quotes discarded from the user's view.
     */
    const answer =
      'The liability cap is AED 100,000 in aggregate [1], applying to all claims under the ' +
      'agreement. The reviewed sections do not specify a separate sub-limit for data breaches.';

    expect(looksLikeNotFound(answer)).toBe(false);
  });

  it('ignores an empty answer', () => {
    expect(looksLikeNotFound('')).toBe(false);
    expect(looksLikeNotFound('   ')).toBe(false);
  });

  it('treats any citation as evidence the answer is asserting a finding', () => {
    // The discriminator: a genuine not-found reply has nothing to cite.
    expect(looksLikeNotFound('The sections do not mention a sub-limit.')).toBe(true);
    expect(looksLikeNotFound('The cap is AED 100,000 [1]; it does not mention a sub-limit.')).toBe(
      false,
    );
  });

  it('recognises a not-found answer that opens with a preamble', () => {
    // A character-position heuristic would miss this; the citation rule does not.
    expect(
      looksLikeNotFound(
        'I reviewed the sections retrieved for this question. They do not mention the CEO salary.',
      ),
    ).toBe(true);
  });

  it('does not fire on an ordinary answer', () => {
    expect(looksLikeNotFound('The governing law is that of the DIFC [1].')).toBe(false);
  });
});

describe('shouldWarnUnsupported', () => {
  it('warns only for UNSUPPORTED', () => {
    expect(shouldWarnUnsupported('UNSUPPORTED')).toBe(true);
    expect(shouldWarnUnsupported('ANSWERED')).toBe(false);
    expect(shouldWarnUnsupported('NOT_FOUND')).toBe(false);
    expect(shouldWarnUnsupported('PARTIAL')).toBe(false);
    expect(shouldWarnUnsupported(null)).toBe(false);
  });
});

describe('buildHistoryText', () => {
  it('renders turns with role labels', () => {
    const text = buildHistoryText([
      { role: 'USER', content: 'What is the liability cap?' },
      { role: 'ASSISTANT', content: 'The cap is AED 100,000.' },
    ]);

    expect(text).toContain('User: What is the liability cap?');
    expect(text).toContain('Assistant: The cap is AED 100,000.');
  });

  it('keeps only the most recent turns', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
      content: `turn ${i}`,
    }));
    const text = buildHistoryText(many);

    expect(text).toContain('turn 19');
    expect(text).not.toContain('turn 0');
  });

  it('strips citation markers', () => {
    /**
     * Left in, the model copies the numbering into its new answer and cites [1] for a quote
     * it never supplied — producing a marker with nothing behind it.
     */
    const text = buildHistoryText([
      { role: 'ASSISTANT', content: 'The cap is AED 100,000 [1] under DIFC law [2].' },
    ]);

    expect(text).not.toContain('[1]');
    expect(text).not.toContain('[2]');
    expect(text).toContain('AED 100,000');
  });

  it('truncates a long assistant turn', () => {
    const text = buildHistoryText([{ role: 'ASSISTANT', content: 'word '.repeat(500) }]);
    expect(text.length).toBeLessThan(800);
  });

  it('returns an empty string for no history', () => {
    expect(buildHistoryText([])).toBe('');
  });
});

describe('previousUserQuestion', () => {
  it('finds the most recent user turn', () => {
    expect(
      previousUserQuestion([
        { role: 'USER', content: 'First question' },
        { role: 'ASSISTANT', content: 'An answer' },
        { role: 'USER', content: 'Second question' },
        { role: 'ASSISTANT', content: 'Another answer' },
      ]),
    ).toBe('Second question');
  });

  it('returns null when there is no user turn', () => {
    expect(previousUserQuestion([{ role: 'ASSISTANT', content: 'An answer' }])).toBeNull();
    expect(previousUserQuestion([])).toBeNull();
  });
});
