/**
 * Builds the honest account of what was read (ARCHITECTURE section 6).
 *
 * This module exists to make one specific failure impossible. The assignment says the worst
 * output the app can produce is confidently stating that a clause does not exist after
 * reading part of the document. So `complete` is computed here, from facts — which sections
 * were sent, whether any page was unreadable, whether the run finished — and the answer is
 * only ever permitted to assert absence when it is true.
 */
import type { CoverageDto } from '@ca/shared';

export interface CoverageChunk {
  ordinal: number;
  clauseRef: string | null;
  heading: string | null;
  startOffset: number;
  endOffset: number;
}

export interface CoveragePage {
  number: number;
  startOffset: number;
  endOffset: number;
  isScanned: boolean;
}

export interface BuildCoverageInput {
  mode: 'RETRIEVAL' | 'THOROUGH';
  /** The chunks actually sent to the model. */
  readChunks: readonly CoverageChunk[];
  /** Every non-boilerplate chunk the document has. */
  totalChunks: number;
  /** Pages, for a PDF. Empty or a single virtual page for a DOCX. */
  pages: readonly CoveragePage[];
  isPdf: boolean;
  /** Set when a thorough run did not finish, e.g. the provider rate-limited us. */
  stoppedEarlyReason?: string | null;
}

/** A readable label for a section: its clause reference, else its heading, else its position. */
export function sectionLabel(chunk: CoverageChunk): string {
  if (chunk.clauseRef !== null && chunk.clauseRef.length > 0) return chunk.clauseRef;
  if (chunk.heading !== null && chunk.heading.length > 0) return truncate(chunk.heading, 40);
  return `Part ${chunk.ordinal + 1}`;
}

export function buildCoverage(input: BuildCoverageInput): CoverageDto {
  const { mode, readChunks, totalChunks, pages, isPdf } = input;

  const skippedPages = pages.filter((page) => page.isScanned).map((page) => page.number);

  /**
   * `complete` requires BOTH halves, and this is the crux of the honesty rule:
   *   - every non-boilerplate section was read, and
   *   - no page was unreadable.
   * A document with scanned pages can never be complete, however many sections were read —
   * there is text in it that nobody has seen (decision D10).
   */
  const readEverySection = totalChunks > 0 && readChunks.length >= totalChunks;
  const stoppedEarly = Boolean(input.stoppedEarlyReason);
  const complete = readEverySection && skippedPages.length === 0 && !stoppedEarly;

  return {
    mode,
    chunksRead: readChunks.length,
    chunksTotal: totalChunks,
    sectionsCovered: readChunks.map(sectionLabel),
    // Pages are meaningless for a DOCX, which has one virtual page (decision D13).
    pagesCovered: isPdf ? formatPagesCovered(readChunks, pages) : null,
    complete,
    skippedPages,
    stoppedEarlyReason: input.stoppedEarlyReason ?? null,
  };
}

/** Which pages the read sections fall on, as collapsed ranges: ["3–5", "41", "88–90"]. */
function formatPagesCovered(
  readChunks: readonly CoverageChunk[],
  pages: readonly CoveragePage[],
): string[] {
  const pageNumbers = new Set<number>();

  for (const chunk of readChunks) {
    for (const page of pages) {
      // Any overlap means part of that page was read.
      if (chunk.startOffset < page.endOffset && page.startOffset < chunk.endOffset) {
        pageNumbers.add(page.number);
      }
    }
  }

  return collapseRanges([...pageNumbers].sort((a, b) => a - b));
}

/** [3,4,5,41,88,89] → ["3–5", "41", "88–89"] */
export function collapseRanges(sorted: readonly number[]): string[] {
  const [first, ...rest] = sorted;
  if (first === undefined) return [];

  const parts: string[] = [];
  let rangeStart = first;
  let previous = first;

  for (const value of rest) {
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    parts.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}–${previous}`);
    rangeStart = value;
    previous = value;
  }
  parts.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}–${previous}`);

  return parts;
}

/**
 * Whether an answer is ALLOWED to state that something is absent.
 *
 * Called before the answer is finalised. The prompt also asks the model not to claim absence
 * in retrieval mode, but a prompt is a request, not a guarantee — this is the check that does
 * not depend on the model cooperating.
 */
export function mayAssertAbsence(coverage: CoverageDto): boolean {
  return coverage.complete;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
