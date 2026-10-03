import type { ComparisonChangeDto, ComparisonCountsDto } from '@ca/shared';
import type { AlignedClausePair } from './clause-aligner';
import { detectChanges, isCriticalClause } from './change-detectors';

export function buildComparisonChanges(pairs: AlignedClausePair[]): {
  changes: ComparisonChangeDto[];
  counts: ComparisonCountsDto;
} {
  const changes: ComparisonChangeDto[] = [];
  let changeCounter = 1;

  for (const pair of pairs) {
    if (pair.type === 'UNCHANGED' && !pair.isCosmetic) {
      // Substantively identical clauses must NOT appear as changes (TEST_GUIDE.md Section 7)
      continue;
    }

    if (pair.type === 'UNCHANGED' && pair.isCosmetic) {
      // Cosmetic change (e.g. comma removed in Entire Agreement)
      changes.push({
        id: `change-${changeCounter++}`,
        type: 'UNCHANGED',
        severity: 'LOW',
        baseClause: pair.baseClause,
        revisedClause: pair.revisedClause,
        summary: 'Punctuation or cosmetic wording adjustment.',
        rationale: 'No substantive legal effect detected.',
        detectorReasons: ['Cosmetic punctuation / formatting adjustment'],
      });
      continue;
    }

    if (pair.type === 'ADDED' && pair.revisedClause) {
      const isCritical = isCriticalClause(pair.revisedClause.title ?? '', pair.revisedClause.body);
      changes.push({
        id: `change-${changeCounter++}`,
        type: 'ADDED',
        severity: isCritical ? 'HIGH' : 'MEDIUM',
        baseClause: null,
        revisedClause: pair.revisedClause,
        summary: `Added new clause ${pair.revisedClause.ref ? `"${pair.revisedClause.ref} ${pair.revisedClause.title ?? ''}"` : `"${pair.revisedClause.title ?? 'New clause'}"`}.`,
        rationale: isCritical ? 'New provision added on critical contractual topic.' : 'New clause added to agreement.',
        detectorReasons: ['Clause added'],
      });
      continue;
    }

    if (pair.type === 'REMOVED' && pair.baseClause) {
      const isCritical = isCriticalClause(pair.baseClause.title ?? '', pair.baseClause.body);
      changes.push({
        id: `change-${changeCounter++}`,
        type: 'REMOVED',
        severity: isCritical ? 'HIGH' : 'MEDIUM',
        baseClause: pair.baseClause,
        revisedClause: null,
        summary: `Removed clause ${pair.baseClause.ref ? `"${pair.baseClause.ref} ${pair.baseClause.title ?? ''}"` : `"${pair.baseClause.title ?? 'Clause'}"`}.`,
        rationale: isCritical ? 'Clause removed on critical subject.' : 'Clause removed from contract.',
        detectorReasons: ['Clause removed'],
      });
      continue;
    }

    if (pair.type === 'MOVED' && pair.baseClause && pair.revisedClause) {
      changes.push({
        id: `change-${changeCounter++}`,
        type: 'MOVED',
        severity: 'LOW',
        baseClause: pair.baseClause,
        revisedClause: pair.revisedClause,
        summary: `Clause ${pair.baseClause.ref ?? ''} moved to ${pair.revisedClause.ref ?? ''}, text unchanged.`,
        rationale: 'Clause location moved in document structure.',
        detectorReasons: ['Clause reordered'],
      });
      continue;
    }

    if (pair.type === 'MODIFIED' && pair.baseClause && pair.revisedClause) {
      const heading = pair.baseClause.title ?? pair.revisedClause.title ?? '';
      const findings = detectChanges(heading, pair.baseClause.body, pair.revisedClause.body);

      let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      const detectorReasons: string[] = [];
      const summaryParts: string[] = [];

      for (const finding of findings) {
        detectorReasons.push(`${finding.label}: ${finding.from} → ${finding.to}`);
        summaryParts.push(`${finding.label}: ${finding.from} → ${finding.to}`);
        if (finding.severity === 'HIGH') {
          severity = 'HIGH';
        } else if (finding.severity === 'MEDIUM' && severity !== 'HIGH') {
          severity = 'MEDIUM';
        }
      }

      let summary: string;
      if (summaryParts.length > 0) {
        summary = summaryParts.join('; ');
      } else {
        summary = 'Sentence reworded with similar operational meaning.';
      }

      changes.push({
        id: `change-${changeCounter++}`,
        type: 'MODIFIED',
        severity,
        baseClause: pair.baseClause,
        revisedClause: pair.revisedClause,
        summary,
        rationale: detectorReasons.length > 0 ? detectorReasons.join('; ') : 'Wording revised.',
        detectorReasons,
      });
    }
  }

  const counts: ComparisonCountsDto = {
    high: changes.filter((c) => c.severity === 'HIGH').length,
    medium: changes.filter((c) => c.severity === 'MEDIUM').length,
    low: changes.filter((c) => c.severity === 'LOW').length,
    total: changes.length,
  };

  return { changes, counts };
}
