import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadDocx, saveDocx } from '../domain/docx-package';
import { buildParagraphModels } from '../domain/paragraph-model';
import { locateEdits } from '../domain/edit-locator';
import { applyRevisions, type EditApplication } from '../domain/revision-writer';
import { validateRedline } from '../domain/simulators';
import { EditPlanner } from '../domain/edit-planner';

describe('redlining engine (TEST_GUIDE.md section 8)', () => {
  const v1Buf = fs.readFileSync(path.resolve(__dirname, '../../../../test/fixtures/10-msa-v1.docx'));
  const trackedBuf = fs.readFileSync(
    path.resolve(__dirname, '../../../../test/fixtures/14-msa-v1-with-existing-tracked-change.docx'),
  );

  const mockLlm: any = {
    structured: async () => ({ edits: [] }),
  };
  const planner = new EditPlanner(mockLlm);

  it('1. Make the liability cap mutual: applies tracked changes cleanly and passes self-check', async () => {
    const { zip, docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const plan = await planner.planEdits('Make the liability cap mutual', paragraphs.map((p) => p.text).join('\n\n'));
    expect(plan.edits.length).toBe(1);

    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );
    expect(located[0]?.dto.status).toBe('APPLICABLE');
    expect(located[0]?.match).toBeDefined();

    const match = located[0]!.match!;
    const apps: EditApplication[] = [
      {
        id: 'e0',
        find: plan.edits[0]!.find,
        replace: plan.edits[0]!.replace,
        paragraphIndex: match.paragraphIndex,
        start: match.start,
        end: match.end,
      },
    ];

    const expectedTexts = applyRevisions(docXml, apps);

    // Verify self-check simulator
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();

    // Verify tracked change XML markers
    const serializer = new (await import('@xmldom/xmldom')).XMLSerializer();
    const updatedXml = serializer.serializeToString(docXml);
    expect(updatedXml).toContain('<w:del');
    expect(updatedXml).toContain('<w:ins');
    expect(updatedXml).toContain('w:author="Contract Analyzer"');

    // Save and reload to verify zip packing
    const repacked = await saveDocx(zip, docXml);
    const reloaded = await loadDocx(repacked);
    expect(reloaded.docXml.getElementsByTagName('w:ins').length).toBeGreaterThan(0);
  });

  it('2. Increase liability cap to AED 250,000: preserves formatting and word-level diff', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const plan = await planner.planEdits('Increase the liability cap to AED 250,000', paragraphs.map((p) => p.text).join('\n\n'));
    expect(plan.edits.length).toBe(1);

    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );
    expect(located[0]?.dto.status).toBe('APPLICABLE');

    const match = located[0]!.match!;
    const apps: EditApplication[] = [
      {
        id: 'e0',
        find: plan.edits[0]!.find,
        replace: plan.edits[0]!.replace,
        paragraphIndex: match.paragraphIndex,
        start: match.start,
        end: match.end,
      },
    ];

    const expectedTexts = applyRevisions(docXml, apps);
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();
  });

  it('3. Multiple edits in one pass: termination notice, payment term, governing law', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const instruction = 'Change the termination for convenience notice to 45 days, the payment term to 45 days, and the governing law to ADGM';
    const plan = await planner.planEdits(instruction, paragraphs.map((p) => p.text).join('\n\n'));
    expect(plan.edits.length).toBeGreaterThanOrEqual(3);

    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    const applicable = located.filter((l) => l.dto.status === 'APPLICABLE');
    expect(applicable.length).toBeGreaterThanOrEqual(3);

    const apps: EditApplication[] = applicable.map((a) => ({
      id: a.dto.id,
      find: a.dto.find,
      replace: a.dto.replace,
      paragraphIndex: a.match!.paragraphIndex,
      start: a.match!.start,
      end: a.match!.end,
    }));

    const expectedTexts = applyRevisions(docXml, apps);
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();
  });

  it('4. Edit inside table cell: Support Services fee to AED 13,500', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const plan = await planner.planEdits('Change the Support Services fee to AED 13,500', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('APPLICABLE');
    const apps: EditApplication[] = [
      {
        id: 'e0',
        find: plan.edits[0]!.find,
        replace: plan.edits[0]!.replace,
        paragraphIndex: located[0]!.match!.paragraphIndex,
        start: located[0]!.match!.start,
        end: located[0]!.match!.end,
      },
    ];

    const expectedTexts = applyRevisions(docXml, apps);
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();
  });

  it('5. Edit inside hyperlink: acceptable use policy', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const plan = await planner.planEdits('Change the acceptable use policy link text to falconridge.example/aup', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('APPLICABLE');
    const apps: EditApplication[] = [
      {
        id: 'e0',
        find: plan.edits[0]!.find,
        replace: plan.edits[0]!.replace,
        paragraphIndex: located[0]!.match!.paragraphIndex,
        start: located[0]!.match!.start,
        end: located[0]!.match!.end,
      },
    ];

    const expectedTexts = applyRevisions(docXml, apps);
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();
  });

  it('6. Preserves line breaks and tabs: notice attention line to Chief Legal Officer', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const { docXml: origDocXml } = await loadDocx(v1Buf);

    const paragraphs = buildParagraphModels(docXml);
    const plan = await planner.planEdits('Change the Supplier\'s notice attention line to Chief Legal Officer', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('APPLICABLE');
    const apps: EditApplication[] = [
      {
        id: 'e0',
        find: plan.edits[0]!.find,
        replace: plan.edits[0]!.replace,
        paragraphIndex: located[0]!.match!.paragraphIndex,
        start: located[0]!.match!.start,
        end: located[0]!.match!.end,
      },
    ];

    const expectedTexts = applyRevisions(docXml, apps);
    expect(() => validateRedline(origDocXml, docXml, expectedTexts)).not.toThrow();
  });

  it('7. Rejects duplicate phrase as AMBIGUOUS', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const paragraphs = buildParagraphModels(docXml);

    const plan = await planner.planEdits('Remove the words "in accordance with Good Industry Practice"', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('REJECTED');
    expect(located[0]?.dto.rejectionReason).toContain('AMBIGUOUS');
  });

  it('8. Rejects cross-paragraph edits as CROSS_PARAGRAPH', async () => {
    const { docXml } = await loadDocx(v1Buf);
    const paragraphs = buildParagraphModels(docXml);

    const plan = await planner.planEdits('Merge clauses 2.1 and 2.2 into one sentence', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('REJECTED');
    expect(located[0]?.dto.rejectionReason).toContain('CROSS_PARAGRAPH');
  });

  it('9. Rejects new clauses and formatting-only changes as OUT_OF_SCOPE', async () => {
    const docText = 'Agreement text...';
    const planNewClause = await planner.planEdits('Add a new anti-bribery clause', docText);
    expect(planNewClause.outOfScopeReason).toContain('OUT_OF_SCOPE');

    const planFormatting = await planner.planEdits('Make the definition of Services bold', docText);
    expect(planFormatting.outOfScopeReason).toContain('OUT_OF_SCOPE');
  });

  it('10. Rejects edits on paragraphs with existing tracked changes (HAS_EXISTING_REVISIONS)', async () => {
    const { docXml } = await loadDocx(trackedBuf);
    const paragraphs = buildParagraphModels(docXml);

    // Paragraph 11 has existing tracked insertion
    const plan = await planner.planEdits('change "full capacity" to "full power"', paragraphs.map((p) => p.text).join('\n\n'));
    const located = locateEdits(
      plan.edits.map((e, idx) => ({ id: `e${idx}`, ...e })),
      paragraphs,
    );

    expect(located[0]?.dto.status).toBe('REJECTED');
    expect(located[0]?.dto.rejectionReason).toContain('HAS_EXISTING_REVISIONS');
  });
});
