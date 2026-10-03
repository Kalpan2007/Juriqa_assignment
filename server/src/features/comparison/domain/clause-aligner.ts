import type { ClauseSegment } from '../../documents/domain/clause-segmenter';
import type { ChangeType, ComparisonClauseDto } from '@ca/shared';

export interface AlignedClausePair {
  type: ChangeType;
  baseClause: ComparisonClauseDto | null;
  revisedClause: ComparisonClauseDto | null;
  similarity: number;
  isCosmetic: boolean;
}

export interface AlignmentResult {
  pairs: AlignedClausePair[];
  renumberNote: string | null;
  unmatchedRatio: number;
}

export function alignClauses(
  baseClauses: ClauseSegment[],
  revisedClauses: ClauseSegment[],
): AlignmentResult {
  const bClauses = baseClauses.map((c, idx) => ({
    ...c,
    ref: c.ref ?? (idx > 0 ? String(idx) : null),
  }));
  const rClauses = revisedClauses.map((c, idx) => ({
    ...c,
    ref: c.ref ?? (idx > 0 ? String(idx) : null),
  }));

  const n = bClauses.length;
  const m = rClauses.length;

  if (n === 0 && m === 0) {
    return { pairs: [], renumberNote: null, unmatchedRatio: 0 };
  }

  // Cost matrix
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const GAP_PENALTY = -0.3;

  for (let row = 0; row <= n; row++) {
    const rowArr = dp[row];
    if (rowArr) rowArr[0] = row * GAP_PENALTY;
  }
  const firstRow = dp[0];
  if (firstRow) {
    for (let col = 0; col <= m; col++) {
      firstRow[col] = col * GAP_PENALTY;
    }
  }

  for (let row = 1; row <= n; row++) {
    for (let col = 1; col <= m; col++) {
      const bClause = bClauses[row - 1];
      const rClause = rClauses[col - 1];
      if (!bClause || !rClause) continue;

      const sim = computeClauseSimilarity(bClause, rClause);
      const score = sim >= 0.4 ? sim * 2 - 0.5 : -1.5;

      const prevRow = dp[row - 1];
      const currRow = dp[row];
      const match = (prevRow?.[col - 1] ?? 0) + score;
      const deleteBase = (prevRow?.[col] ?? 0) + GAP_PENALTY;
      const insertRev = (currRow?.[col - 1] ?? 0) + GAP_PENALTY;

      if (currRow) {
        currRow[col] = Math.max(match, deleteBase, insertRev);
      }
    }
  }

  // Traceback
  let i = n;
  let j = m;
  const rawPairs: Array<{
    base: ClauseSegment | null;
    revised: ClauseSegment | null;
    sim: number;
  }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const bClause = bClauses[i - 1];
      const rClause = rClauses[j - 1];
      if (bClause && rClause) {
        const sim = computeClauseSimilarity(bClause, rClause);
        const score = sim >= 0.4 ? sim * 2 - 0.5 : -1.5;

        const currVal = dp[i]?.[j] ?? 0;
        const diagVal = dp[i - 1]?.[j - 1] ?? 0;

        if (Math.abs(currVal - (diagVal + score)) < 1e-6) {
          rawPairs.unshift({ base: bClause, revised: rClause, sim });
          i--;
          j--;
          continue;
        }
      }
    }

    const currVal = dp[i]?.[j] ?? 0;
    const upVal = dp[i - 1]?.[j] ?? 0;

    if (i > 0 && Math.abs(currVal - (upVal + GAP_PENALTY)) < 1e-6) {
      rawPairs.unshift({ base: bClauses[i - 1] ?? null, revised: null, sim: 0 });
      i--;
    } else {
      rawPairs.unshift({ base: null, revised: rClauses[j - 1] ?? null, sim: 0 });
      j--;
    }
  }

  // Post-pass: check if any REMOVED and ADDED clauses are actually MOVED
  const removedCandidates: Array<{ index: number; clause: ClauseSegment }> = [];
  const addedCandidates: Array<{ index: number; clause: ClauseSegment }> = [];

  rawPairs.forEach((pair, idx) => {
    if (pair.base && !pair.revised) {
      removedCandidates.push({ index: idx, clause: pair.base });
    } else if (!pair.base && pair.revised) {
      addedCandidates.push({ index: idx, clause: pair.revised });
    }
  });

  const movedPairs: AlignedClausePair[] = [];
  const matchedRemovedIndices = new Set<number>();
  const matchedAddedIndices = new Set<number>();

  for (const rem of removedCandidates) {
    for (const add of addedCandidates) {
      if (matchedAddedIndices.has(add.index)) continue;
      const sim = computeClauseSimilarity(rem.clause, add.clause);
      const titleA = (rem.clause.heading ?? '').trim().toLowerCase();
      const titleB = (add.clause.heading ?? '').trim().toLowerCase();
      const titleMatch = titleA.length > 2 && titleB.length > 2 && titleA === titleB;

      if (sim >= 0.75 || (titleMatch && sim >= 0.5)) {
        matchedRemovedIndices.add(rem.index);
        matchedAddedIndices.add(add.index);
        movedPairs.push({
          type: 'MOVED',
          baseClause: toClauseDto(rem.clause),
          revisedClause: toClauseDto(add.clause),
          similarity: sim,
          isCosmetic: false,
        });
        break;
      }
    }
  }

  // Final classification
  const finalPairs: AlignedClausePair[] = [];
  let unmatchedCount = 0;

  rawPairs.forEach((pair, idx) => {
    if (matchedRemovedIndices.has(idx) || matchedAddedIndices.has(idx)) {
      return;
    }

    if (pair.base && !pair.revised) {
      unmatchedCount++;
      finalPairs.push({
        type: 'REMOVED',
        baseClause: toClauseDto(pair.base),
        revisedClause: null,
        similarity: 0,
        isCosmetic: false,
      });
      return;
    }

    if (!pair.base && pair.revised) {
      unmatchedCount++;
      finalPairs.push({
        type: 'ADDED',
        baseClause: null,
        revisedClause: toClauseDto(pair.revised),
        similarity: 0,
        isCosmetic: false,
      });
      return;
    }

    if (pair.base && pair.revised) {
      const isExact = normalizeWs(pair.base.body) === normalizeWs(pair.revised.body);
      const isPunctuationOnly =
        stripPunctuation(pair.base.body) === stripPunctuation(pair.revised.body);

      if (isExact) {
        finalPairs.push({
          type: 'UNCHANGED',
          baseClause: toClauseDto(pair.base),
          revisedClause: toClauseDto(pair.revised),
          similarity: 1.0,
          isCosmetic: false,
        });
      } else if (isPunctuationOnly) {
        finalPairs.push({
          type: 'UNCHANGED',
          baseClause: toClauseDto(pair.base),
          revisedClause: toClauseDto(pair.revised),
          similarity: 0.99,
          isCosmetic: true,
        });
      } else {
        finalPairs.push({
          type: 'MODIFIED',
          baseClause: toClauseDto(pair.base),
          revisedClause: toClauseDto(pair.revised),
          similarity: pair.sim,
          isCosmetic: false,
        });
      }
    }
  });

  // Append moved pairs
  finalPairs.push(...movedPairs);

  // Compute renumber note
  const renumberPairs = finalPairs.filter(
    (p) =>
      p.type !== 'MOVED' &&
      p.type !== 'ADDED' &&
      p.type !== 'REMOVED' &&
      p.baseClause?.ref &&
      p.revisedClause?.ref &&
      p.baseClause.ref !== p.revisedClause.ref,
  );

  let renumberNote: string | null = null;
  const first = renumberPairs[0];
  const last = renumberPairs[renumberPairs.length - 1];
  if (first?.baseClause?.ref && first?.revisedClause?.ref && last?.baseClause?.ref && last?.revisedClause?.ref) {
    renumberNote = `Clauses ${first.baseClause.ref}–${last.baseClause.ref} were renumbered to ${first.revisedClause.ref}–${last.revisedClause.ref}.`;
  }

  const totalClauses = Math.max(1, Math.max(n, m));
  const unmatchedRatio = unmatchedCount / totalClauses;

  return {
    pairs: finalPairs,
    renumberNote,
    unmatchedRatio,
  };
}

export function computeClauseSimilarity(a: ClauseSegment, b: ClauseSegment): number {
  const normA = normalizeWs(a.body);
  const normB = normalizeWs(b.body);

  if (normA === normB) return 1.0;

  // Title match / conflict
  const titleA = (a.heading ?? '').trim().toLowerCase();
  const titleB = (b.heading ?? '').trim().toLowerCase();
  const titleMatch = titleA.length > 2 && titleB.length > 2 && titleA === titleB;
  const titleConflict =
    titleA.length > 2 &&
    titleB.length > 2 &&
    !titleMatch &&
    !titleA.includes(titleB) &&
    !titleB.includes(titleA);

  if (titleConflict) {
    // Clauses with completely different titles (e.g. COUNTERPARTS vs NOTICES) must not align
    return 0.05;
  }

  // Jaccard similarity of 3-grams or words
  const wordsA = new Set(normA.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  const wordsB = new Set(normB.toLowerCase().split(/\s+/).filter((w) => w.length > 1));

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  if (titleMatch) {
    return Math.min(1.0, 0.4 + 0.6 * jaccard);
  }
  return jaccard;
}

function normalizeWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function stripPunctuation(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function toClauseDto(c: ClauseSegment): ComparisonClauseDto {
  return {
    ref: c.ref,
    title: c.heading,
    body: c.body,
    startOffset: c.start,
    endOffset: c.end,
    pageNumber: null,
  };
}
