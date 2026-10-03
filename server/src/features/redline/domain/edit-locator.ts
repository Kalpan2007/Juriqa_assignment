import type { RedlineEditDto } from '@ca/shared';
import type { ParagraphModel } from './paragraph-model';

export interface LocatedEdit {
  dto: RedlineEditDto;
  match?: {
    paragraphIndex: number;
    start: number;
    end: number;
  };
}

export function locateEdits(
  rawEdits: Array<{ id: string; find: string; replace: string; reason: string; clauseRef?: string | null }>,
  paragraphs: ParagraphModel[],
): LocatedEdit[] {
  const fullDocText = paragraphs.map((p) => p.text).join('\n\n');
  const results: LocatedEdit[] = [];
  const occupiedRangesByParagraph = new Map<number, Array<{ start: number; end: number }>>();

  for (const edit of rawEdits) {
    const { id, find, replace, reason, clauseRef } = edit;

    // 1. Identical find and replace (no-op)
    if (find.trim() === replace.trim()) {
      results.push({
        dto: {
          id,
          find,
          replace,
          reason,
          clauseRef,
          status: 'REJECTED',
          rejectionReason: 'NO_OP: The new wording is identical to the current wording.',
        },
      });
      continue;
    }

    // 2. Find matches across paragraphs
    const matches: Array<{ paragraphIndex: number; start: number; end: number }> = [];
    const normFind = normalizeQuotes(find);

    paragraphs.forEach((p) => {
      const normText = normalizeQuotes(p.text);
      let startIndex = 0;
      while (startIndex < normText.length) {
        const found = normText.indexOf(normFind, startIndex);
        if (found === -1) break;
        matches.push({
          paragraphIndex: p.index,
          start: found,
          end: found + find.length,
        });
        startIndex = found + 1;
      }
    });

    // 3. No match in any paragraph
    if (matches.length === 0) {
      const normFullDoc = normalizeQuotes(fullDocText);
      const isCrossParagraph =
        normFullDoc.includes(normFind) ||
        (normFind.includes('\n') &&
          paragraphs.some((p) => p.text.length > 10 && normFind.includes(normalizeQuotes(p.text.slice(0, 30)))));

      results.push({
        dto: {
          id,
          find,
          replace,
          reason,
          clauseRef,
          status: 'REJECTED',
          rejectionReason: isCrossParagraph
            ? 'CROSS_PARAGRAPH: This change spans more than one paragraph, which is not supported.'
            : 'NOT_FOUND: The AI proposed text that is not in the document.',
        },
      });
      continue;
    }

    // 4. Ambiguous match (>1 in document)
    if (matches.length > 1) {
      results.push({
        dto: {
          id,
          find,
          replace,
          reason,
          clauseRef,
          status: 'REJECTED',
          rejectionReason: `AMBIGUOUS: This wording appears ${matches.length} times, so it is not clear which to change.`,
        },
      });
      continue;
    }

    const singleMatch = matches[0];
    if (!singleMatch) continue;

    const targetP = paragraphs.find((p) => p.index === singleMatch.paragraphIndex);

    // 5. Existing revisions in paragraph
    if (targetP?.hasExistingRevisions) {
      results.push({
        dto: {
          id,
          find,
          replace,
          reason,
          clauseRef,
          paragraphIndex: singleMatch.paragraphIndex,
          status: 'REJECTED',
          rejectionReason: 'HAS_EXISTING_REVISIONS: This paragraph already contains tracked changes.',
        },
      });
      continue;
    }

    // 6. Overlaps with earlier edit in same paragraph
    const occupied = occupiedRangesByParagraph.get(singleMatch.paragraphIndex) ?? [];
    const hasOverlap = occupied.some(
      (rng) => Math.max(rng.start, singleMatch.start) < Math.min(rng.end, singleMatch.end),
    );

    if (hasOverlap) {
      results.push({
        dto: {
          id,
          find,
          replace,
          reason,
          clauseRef,
          paragraphIndex: singleMatch.paragraphIndex,
          status: 'REJECTED',
          rejectionReason: 'OVERLAPS: This edit overlaps another edit in the same paragraph.',
        },
      });
      continue;
    }

    // Record occupied range
    occupied.push({ start: singleMatch.start, end: singleMatch.end });
    occupiedRangesByParagraph.set(singleMatch.paragraphIndex, occupied);

    // Applicable!
    results.push({
      dto: {
        id,
        find,
        replace,
        reason,
        clauseRef,
        paragraphIndex: singleMatch.paragraphIndex,
        status: 'APPLICABLE',
      },
      match: singleMatch,
    });
  }

  return results;
}

function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}
