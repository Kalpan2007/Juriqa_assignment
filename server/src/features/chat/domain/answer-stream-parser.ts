import { QUOTES_DELIMITER } from '@ca/shared';

/**
 * Splits a streaming answer into the prose the user sees and the quote JSON that follows
 * (ARCHITECTURE section 7).
 *
 * The model is asked to write its answer, then a line containing `---QUOTES---`, then JSON.
 * Everything before the delimiter is forwarded to the browser immediately; everything after
 * is buffered and parsed once the stream ends.
 *
 * The hard part is that tokens arrive in arbitrary pieces. A delimiter can be split across
 * two chunks ("---QUO" then "TES---"), so the parser never emits the tail of its buffer until
 * it knows that tail cannot be the start of a delimiter. Without that, the delimiter is
 * missed and its text leaks into the visible answer — and every quote is lost.
 */
export interface ParseStep {
  /** Text safe to forward to the client now. May be empty. */
  delta: string;
}

export class AnswerStreamParser {
  /** Text seen before the delimiter, in full. */
  private answerText = '';
  /** Text seen after the delimiter — the quote JSON. */
  private quotesText = '';
  /** Not yet emitted, because it might be the beginning of the delimiter. */
  private pending = '';
  private delimiterFound = false;

  /**
   * Feeds one chunk in and returns whatever is now safe to emit.
   */
  push(chunk: string): ParseStep {
    if (this.delimiterFound) {
      this.quotesText += chunk;
      return { delta: '' };
    }

    this.pending += chunk;

    const delimiterIndex = this.pending.indexOf(QUOTES_DELIMITER);
    if (delimiterIndex !== -1) {
      const before = this.pending.slice(0, delimiterIndex);
      this.quotesText = this.pending.slice(delimiterIndex + QUOTES_DELIMITER.length);
      this.pending = '';
      this.delimiterFound = true;

      // Trailing whitespace before the delimiter is formatting, not content.
      const delta = trimTrailingNewlines(before);
      this.answerText += delta;
      return { delta };
    }

    /**
     * Hold back everything that could still turn out to be "whitespace, then a delimiter".
     *
     * Two parts, and both are needed:
     *  - `QUOTES_DELIMITER.length - 1` characters, because a delimiter can be split at any
     *    character and a shorter hold-back would let the worst split slip through;
     *  - any whitespace immediately before that, because the model writes a newline before
     *    the delimiter. Without this the newline is emitted while the delimiter is still
     *    only half-arrived, and the visible answer ends with a stray blank line that no
     *    later trim can remove — it has already been sent to the browser.
     */
    const delimiterHold = Math.min(this.pending.length, QUOTES_DELIMITER.length - 1);
    let boundary = this.pending.length - delimiterHold;
    while (boundary > 0 && isWhitespace(this.pending[boundary - 1])) boundary -= 1;

    const emitUpTo = boundary;
    if (emitUpTo <= 0) return { delta: '' };

    const delta = this.pending.slice(0, emitUpTo);
    this.pending = this.pending.slice(emitUpTo);
    this.answerText += delta;
    return { delta };
  }

  /**
   * Ends the stream and returns anything still held back.
   *
   * If the model never produced the delimiter, everything it wrote is the answer and there
   * are no quotes — which the caller turns into the UNSUPPORTED state rather than pretending
   * the answer was supported.
   */
  finish(): { delta: string; answerText: string; quotesText: string; sawDelimiter: boolean } {
    let delta = '';

    if (!this.delimiterFound && this.pending.length > 0) {
      delta = trimTrailingNewlines(this.pending);
      this.answerText += delta;
      this.pending = '';
    }

    return {
      delta,
      answerText: this.answerText,
      quotesText: this.quotesText,
      sawDelimiter: this.delimiterFound,
    };
  }

  /** The answer so far — used to persist partial text when the user presses Stop. */
  get currentAnswer(): string {
    return this.answerText + this.pending;
  }
}

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}

/**
 * Drops trailing whitespace. Safe to do here because `push` never emits the whitespace at
 * the end of its buffer, so this cannot contradict something already sent to the browser.
 */
function trimTrailingNewlines(text: string): string {
  return text.replace(/\s+$/, '');
}
