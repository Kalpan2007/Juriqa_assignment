/**
 * Decides how much document text fits in one request (ARCHITECTURE sections 6 and 12).
 *
 * The budget has to account for four things, and getting it wrong is expensive in both
 * directions: too generous and the provider rejects the request mid-answer, too mean and the
 * answer is based on less of the document than it could have been.
 *
 *   system prompt + conversation history + excerpts + reserved output ≤ limit
 *
 * One detail specific to this stack: the configured model is a reasoning model, and its
 * reasoning tokens are billed as OUTPUT. Verified against Groq — a 20-token ceiling produced
 * an EMPTY answer because reasoning consumed all of it. So the output reserve is deliberately
 * generous, and never trimmed to make room for more excerpts.
 */
import { estimateTokens } from '../../../core/utils/tokens';

/** Tokens held back for the answer, including the model's reasoning tokens. */
export const OUTPUT_RESERVE_TOKENS = 1_600;

/** Never send a request whose excerpts are smaller than this; below it, answer quality dies. */
export const MIN_EXCERPT_TOKENS = 500;

export interface BudgetInput {
  /** `LLM_MAX_INPUT_TOKENS`. */
  maxInputTokens: number;
  systemPromptText: string;
  /** Rendered conversation history, already trimmed to the last few turns. */
  historyText: string;
  /** The user's question. */
  questionText: string;
  outputReserveTokens?: number;
}

export interface Budget {
  /** Tokens available for document excerpts. */
  excerptTokens: number;
  /** True when there is not enough room to send anything useful. */
  exhausted: boolean;
}

export function computeBudget(input: BudgetInput): Budget {
  const reserve = input.outputReserveTokens ?? OUTPUT_RESERVE_TOKENS;

  const fixed =
    estimateTokens(input.systemPromptText) +
    estimateTokens(input.historyText) +
    estimateTokens(input.questionText);

  const excerptTokens = input.maxInputTokens - fixed - reserve;

  return {
    excerptTokens: Math.max(0, excerptTokens),
    exhausted: excerptTokens < MIN_EXCERPT_TOKENS,
  };
}

export interface SelectableChunk {
  id: string;
  ordinal: number;
  tokenCount: number;
  /** Relevance score; higher is better. Ignored for a thorough read. */
  score?: number;
}

export interface Selection<T extends SelectableChunk> {
  selected: T[];
  /** Chunks that did not fit. */
  omitted: T[];
  tokensUsed: number;
}

/**
 * Picks the highest-scoring chunks that fit, then returns them in DOCUMENT order.
 *
 * Both halves matter. Selecting by score means the most relevant clause is never cut for a
 * less relevant one earlier in the file. Re-sorting into document order means the model reads
 * the contract the way it was written — clause 2 before clause 14 — which matters because a
 * later clause routinely qualifies an earlier one.
 */
export function selectChunksByBudget<T extends SelectableChunk>(
  chunks: readonly T[],
  excerptTokens: number,
): Selection<T> {
  const byScore = [...chunks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.ordinal - b.ordinal);

  const selected: T[] = [];
  const omitted: T[] = [];
  let tokensUsed = 0;

  for (const chunk of byScore) {
    if (tokensUsed + chunk.tokenCount <= excerptTokens) {
      selected.push(chunk);
      tokensUsed += chunk.tokenCount;
    } else {
      omitted.push(chunk);
    }
  }

  selected.sort((a, b) => a.ordinal - b.ordinal);
  return { selected, omitted, tokensUsed };
}

/**
 * Splits chunks into batches for a thorough read, each batch fitting the budget.
 *
 * Document order is preserved across and within batches, so the map phase reads the contract
 * sequentially. A chunk larger than a whole batch still gets its own batch rather than being
 * dropped — silently skipping it would make `complete` a lie.
 */
export function batchChunksByBudget<T extends SelectableChunk>(
  chunks: readonly T[],
  excerptTokens: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentTokens = 0;

  for (const chunk of [...chunks].sort((a, b) => a.ordinal - b.ordinal)) {
    const wouldExceed = currentTokens + chunk.tokenCount > excerptTokens;

    if (wouldExceed && current.length > 0) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(chunk);
    currentTokens += chunk.tokenCount;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Splits a budget between the documents of a multi-document chat (ARCHITECTURE section 9).
 *
 * Every document gets an equal share and a guaranteed minimum, because an answer that
 * compares documents must have read something from each of them. If the budget cannot cover
 * the minimum for all of them, the caller must reduce the document count rather than quietly
 * answer about a subset.
 */
export function splitBudgetAcrossDocuments(
  excerptTokens: number,
  documentCount: number,
  minimumPerDocument: number,
): { perDocument: number; feasible: boolean } {
  if (documentCount <= 0) return { perDocument: 0, feasible: false };

  const perDocument = Math.floor(excerptTokens / documentCount);
  return { perDocument, feasible: perDocument >= minimumPerDocument };
}
