/**
 * Turns clause segments into retrieval chunks (ARCHITECTURE section 4).
 *
 * The constraints come from two directions and pull against each other:
 *   - the LLM has a token budget, so a chunk cannot be huge;
 *   - an answer must be quotable, so a chunk must not cut a clause in half and strand the
 *     sentence that actually answers the question.
 * So: merge small clauses up to a target, split oversized ones at sentence boundaries, and
 * overlap neighbours slightly so a fact sitting on a boundary appears whole in one of them.
 *
 * Pure. Offsets are the only link back to `fullText` — chunk text is stored for full-text
 * search, but it is always exactly `fullText.slice(start, end)`.
 */
import { estimateTokens } from '../../../core/utils/tokens';
import { boilerplateOverlapRatio } from './boilerplate-detector';
import type { ClauseSegment } from './clause-segmenter';

/** Target size. Big enough to hold a whole clause, small enough to fit several in a prompt. */
export const TARGET_TOKENS = 1_000;
/** Above this a chunk is split. */
export const MAX_TOKENS = 1_200;
/** Below this a chunk is merged with its neighbour, unless it is the last one. */
export const MIN_TOKENS = 120;
/** Overlap between consecutive chunks of a split clause. */
export const OVERLAP_RATIO = 0.1;
/** A chunk this much boilerplate is excluded from retrieval and comparison. */
export const BOILERPLATE_CHUNK_RATIO = 0.6;

export interface Chunk {
  ordinal: number;
  heading: string | null;
  clauseRef: string | null;
  start: number;
  end: number;
  tokenCount: number;
  text: string;
  isBoilerplate: boolean;
}

export interface ChunkOptions {
  boilerplateRanges?: ReadonlyArray<{ start: number; end: number }>;
  targetTokens?: number;
  maxTokens?: number;
  minTokens?: number;
}

export function chunkSegments(
  fullText: string,
  segments: readonly ClauseSegment[],
  options: ChunkOptions = {},
): Chunk[] {
  const target = options.targetTokens ?? TARGET_TOKENS;
  const max = options.maxTokens ?? MAX_TOKENS;
  const min = options.minTokens ?? MIN_TOKENS;
  const boilerplateRanges = options.boilerplateRanges ?? [];

  if (segments.length === 0) return [];

  // 1. Oversized segments become several pieces; everything else passes through.
  const pieces: Array<{ segment: ClauseSegment; start: number; end: number }> = [];
  for (const segment of segments) {
    const tokens = estimateTokens(segment.text);
    if (tokens <= max) {
      pieces.push({ segment, start: segment.start, end: segment.end });
      continue;
    }
    for (const range of splitRange(fullText, segment.start, segment.end, target)) {
      pieces.push({ segment, start: range.start, end: range.end });
    }
  }

  // 2. Merge consecutive pieces while they stay under the target, so a contract of many tiny
  //    sub-clauses does not produce hundreds of useless chunks.
  const merged: Array<{ segment: ClauseSegment; start: number; end: number }> = [];
  for (const piece of pieces) {
    const previous = merged[merged.length - 1];
    if (previous === undefined) {
      merged.push({ ...piece });
      continue;
    }

    const combinedTokens = estimateTokens(fullText.slice(previous.start, piece.end));
    const previousTokens = estimateTokens(fullText.slice(previous.start, previous.end));
    const pieceTokens = estimateTokens(fullText.slice(piece.start, piece.end));

    // Merge when the result still fits AND at least one side is too small to stand alone.
    const shouldMerge =
      combinedTokens <= target && (previousTokens < min || pieceTokens < min);

    if (shouldMerge) {
      previous.end = piece.end;
      // The merged chunk keeps the FIRST heading: it is the one that labels the passage.
    } else {
      merged.push({ ...piece });
    }
  }

  // 3. Materialise, recording offsets and the boilerplate verdict.
  return merged.map((piece, index) => {
    const text = fullText.slice(piece.start, piece.end);
    const ratio = boilerplateOverlapRatio(
      { start: piece.start, end: piece.end },
      boilerplateRanges,
    );
    return {
      ordinal: index,
      heading: piece.segment.heading,
      clauseRef: piece.segment.ref,
      start: piece.start,
      end: piece.end,
      tokenCount: estimateTokens(text),
      text,
      isBoilerplate: ratio >= BOILERPLATE_CHUNK_RATIO,
    };
  });
}

/**
 * Splits one oversized range into target-sized pieces with overlap, preferring to cut at a
 * paragraph break, then a sentence end, and only mid-text as a last resort.
 *
 * The overlap is what stops a clause boundary from hiding a fact: a sentence that would land
 * exactly on a cut appears complete in the following piece.
 */
function splitRange(
  fullText: string,
  rangeStart: number,
  rangeEnd: number,
  targetTokens: number,
): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  // estimateTokens is chars/3.5, so invert it to get a character budget.
  const targetChars = Math.max(200, Math.floor(targetTokens * 3.5));
  const overlapChars = Math.floor(targetChars * OVERLAP_RATIO);

  let start = rangeStart;
  while (start < rangeEnd) {
    const idealEnd = Math.min(start + targetChars, rangeEnd);
    const end = idealEnd >= rangeEnd ? rangeEnd : findCutPoint(fullText, start, idealEnd);

    result.push({ start, end });

    if (end >= rangeEnd) break;
    // Step back by the overlap, but always make progress.
    const nextStart = Math.max(start + 1, end - overlapChars);
    start = nextStart;
  }

  return result;
}

/** Looks backwards from `idealEnd` for the best boundary, within a sensible window. */
function findCutPoint(fullText: string, start: number, idealEnd: number): number {
  const window = Math.floor((idealEnd - start) * 0.3);
  const earliest = Math.max(start + 1, idealEnd - window);

  const paragraph = fullText.lastIndexOf('\n\n', idealEnd);
  if (paragraph >= earliest) return paragraph + 2;

  const newline = fullText.lastIndexOf('\n', idealEnd);
  if (newline >= earliest) return newline + 1;

  // Sentence end: ". " / ".\n" — avoids cutting "AED 1,000,000." in half.
  for (let index = idealEnd; index > earliest; index -= 1) {
    const char = fullText[index];
    const next = fullText[index + 1];
    if ((char === '.' || char === ';') && (next === ' ' || next === '\n' || next === undefined)) {
      return index + 1;
    }
  }

  const space = fullText.lastIndexOf(' ', idealEnd);
  if (space >= earliest) return space + 1;

  return idealEnd;
}
