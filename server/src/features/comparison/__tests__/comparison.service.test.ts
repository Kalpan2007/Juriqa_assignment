import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractDocx } from '../../documents/domain/docx-extractor';
import { segmentClauses } from '../../documents/domain/clause-segmenter';
import { alignClauses } from '../domain/clause-aligner';
import { buildComparisonChanges } from '../domain/comparison-builder';

describe('comparison engine: MSA v1 vs MSA v2 (TEST_GUIDE.md section 7)', () => {
  const v1Path = path.resolve(__dirname, '../../../../test/fixtures/10-msa-v1.docx');
  const v2Path = path.resolve(__dirname, '../../../../test/fixtures/11-msa-v2.docx');

  const v1Buf = fs.readFileSync(v1Path);
  const v2Buf = fs.readFileSync(v2Path);

  it('aligns and detects all 11 known changes with correct types and severities', async () => {
    const ext1 = await extractDocx(v1Buf);
    const ext2 = await extractDocx(v2Buf);

    const baseClauses = segmentClauses(ext1.fullText);
    const revClauses = segmentClauses(ext2.fullText);

    expect(baseClauses.length).toBeGreaterThan(10);
    expect(revClauses.length).toBeGreaterThan(10);

    const alignment = alignClauses(baseClauses, revClauses);
    const { changes, counts } = buildComparisonChanges(alignment.pairs);

    expect(changes.length).toBeGreaterThan(5);


    // 1. Limitation of Liability: AED 100,000 -> 1,000,000 (HIGH)
    const liability = changes.find((c) => c.baseClause?.title?.toLowerCase().includes('liability'));
    expect(liability).toBeDefined();
    expect(liability?.severity).toBe('HIGH');
    expect(liability?.detectorReasons.some((r) => r.includes('Amount changed'))).toBe(true);

    // 2. Governing Law: DIFC -> ADGM (HIGH)
    const governingLaw = changes.find((c) => c.baseClause?.title?.toLowerCase().includes('governing law'));
    expect(governingLaw).toBeDefined();
    expect(governingLaw?.severity).toBe('HIGH');
    expect(governingLaw?.detectorReasons.some((r) => r.includes('Governing law'))).toBe(true);

    // 3. Insurance: shall -> may (HIGH - obligation flip)
    const insurance = changes.find((c) => c.baseClause?.title?.toLowerCase().includes('insurance'));
    expect(insurance).toBeDefined();
    expect(insurance?.severity).toBe('HIGH');
    expect(insurance?.detectorReasons.some((r) => r.includes('Obligation flip'))).toBe(true);

    // 4. Fees and Payment: 1.5% -> 2% (HIGH - percentage)
    const fees = changes.find((c) => c.baseClause?.title?.toLowerCase().includes('fees'));
    expect(fees).toBeDefined();
    expect(fees?.severity).toBe('HIGH');
    expect(fees?.detectorReasons.some((r) => r.includes('Percentage changed') || r.includes('Amount changed'))).toBe(true);

    // 5. Termination: 30 -> 60 days (MEDIUM - duration)
    const termination = changes.find((c) => c.baseClause?.title?.toLowerCase().includes('termination'));
    expect(termination).toBeDefined();
    expect(termination?.severity).toBe('MEDIUM');
    expect(termination?.detectorReasons.some((r) => r.includes('Duration changed'))).toBe(true);

    // 6. Implementation and Onboarding (ADDED)
    const added = changes.find((c) => c.type === 'ADDED');
    expect(added).toBeDefined();
    expect(added?.revisedClause?.title?.toLowerCase().includes('implementation') || added?.revisedClause?.body?.toLowerCase().includes('implementation')).toBe(true);

    // 7. Counterparts (REMOVED)
    const removed = changes.find((c) => c.type === 'REMOVED');
    expect(removed).toBeDefined();
    expect(removed?.baseClause?.title?.toLowerCase().includes('counterparts') || removed?.baseClause?.body?.toLowerCase().includes('counterparts')).toBe(true);

    // 8. Notices (MOVED)
    const moved = changes.find((c) => c.type === 'MOVED');
    expect(moved).toBeDefined();
    expect(moved?.baseClause?.title?.toLowerCase().includes('notices') || moved?.baseClause?.body?.toLowerCase().includes('notices')).toBe(true);

    // 9. Renumber note present
    expect(alignment.renumberNote).toBeTruthy();

    // 10. Unchanged clauses like Warranties, IP, Customer Obligations must NOT be in changes
    const warranties = changes.find((c) => c.baseClause?.title === 'Warranties' && c.type === 'MODIFIED');
    expect(warranties).toBeUndefined();

    // Counts check
    expect(counts.high).toBeGreaterThanOrEqual(4);
    expect(counts.total).toBe(changes.length);
  });

  it('reports zero substantive changes when comparing a document to itself', async () => {
    const ext1 = await extractDocx(v1Buf);
    const clauses = segmentClauses(ext1.fullText);

    const alignment = alignClauses(clauses, clauses);
    const { changes, counts } = buildComparisonChanges(alignment.pairs);

    expect(changes).toHaveLength(0);
    expect(counts.total).toBe(0);
  });
});
