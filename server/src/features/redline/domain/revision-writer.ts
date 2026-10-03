import { diffWordsWithSpace } from 'diff';
import { buildParagraphModels, type ParagraphModel } from './paragraph-model';

export interface EditApplication {
  id: string;
  find: string;
  replace: string;
  paragraphIndex: number;
  start: number;
  end: number;
}

interface ChangeOp {
  start: number;
  delText: string;
  insText: string;
}

const DEFAULT_REVISION_DATE = '2026-02-10T09:30:00.000Z';

export function applyRevisions(
  docXml: Document,
  applications: EditApplication[],
  author = 'Contract Analyzer',
  isoDate = DEFAULT_REVISION_DATE,
): Map<number, string> {
  const expectedAcceptedTexts = new Map<number, string>();

  // Find max existing revision ID across the document
  let maxId = 0;
  const existingInss = Array.from(docXml.getElementsByTagName('w:ins'));
  const existingDels = Array.from(docXml.getElementsByTagName('w:del'));
  for (const el of [...existingInss, ...existingDels]) {
    const idAttr = el.getAttribute('w:id');
    if (idAttr) {
      const parsed = parseInt(idAttr, 10);
      if (!isNaN(parsed) && parsed > maxId) maxId = parsed;
    }
  }

  const nextRevisionId = () => ++maxId;

  // Group applications by paragraph
  const byParagraph = new Map<number, EditApplication[]>();
  for (const app of applications) {
    const list = byParagraph.get(app.paragraphIndex) ?? [];
    list.push(app);
    byParagraph.set(app.paragraphIndex, list);
  }

  // Process each paragraph
  for (const [pIndex, apps] of byParagraph.entries()) {
    // Re-read current paragraph models
    const models = buildParagraphModels(docXml);
    const pModel = models.find((m) => m.index === pIndex);
    if (!pModel) continue;

    // Calculate expected accepted text
    let acceptedText = pModel.text;
    // Sort apps in reverse order by start offset for replacing in text
    const sortedApps = [...apps].sort((a, b) => b.start - a.start);
    for (const app of sortedApps) {
      acceptedText =
        acceptedText.slice(0, app.start) + app.replace + acceptedText.slice(app.end);
    }
    expectedAcceptedTexts.set(pIndex, acceptedText);

    // Convert each edit into fine-grained word diff operations
    const changeOps: ChangeOp[] = [];
    for (const app of apps) {
      const wordDiff = diffWordsWithSpace(app.find, app.replace);
      let currOffset = app.start;

      let i = 0;
      while (i < wordDiff.length) {
        const part = wordDiff[i];
        if (!part) {
          i++;
          continue;
        }

        if (!part.added && !part.removed) {
          currOffset += part.value.length;
          i++;
        } else if (part.removed && i + 1 < wordDiff.length && wordDiff[i + 1]?.added) {
          // Replacement: removed followed by added
          const addedPart = wordDiff[i + 1];
          changeOps.push({
            start: currOffset,
            delText: part.value,
            insText: addedPart?.value ?? '',
          });
          currOffset += part.value.length;
          i += 2;
        } else if (part.removed) {
          // Pure deletion
          changeOps.push({
            start: currOffset,
            delText: part.value,
            insText: '',
          });
          currOffset += part.value.length;
          i++;
        } else if (part.added) {
          // Pure insertion
          changeOps.push({
            start: currOffset,
            delText: '',
            insText: part.value,
          });
          i++;
        } else {
          i++;
        }
      }
    }

    // Sort all change operations in reverse order (right-to-left)
    changeOps.sort((a, b) => b.start - a.start);

    for (const op of changeOps) {
      applyChangeOpToParagraph(docXml, pIndex, op, nextRevisionId, author, isoDate);
    }
  }

  return expectedAcceptedTexts;
}

function applyChangeOpToParagraph(
  docXml: Document,
  pIndex: number,
  op: ChangeOp,
  nextId: () => number,
  author: string,
  date: string,
): void {
  // Re-fetch paragraph model after previous operations
  const models = buildParagraphModels(docXml);
  const pModel = models.find((m) => m.index === pIndex);
  if (!pModel) return;

  const { start, delText, insText } = op;
  const delEnd = start + delText.length;

  if (delText.length > 0) {
    // 1. Split runs so [start, delEnd) is covered by exact runs
    splitParagraphAtOffset(docXml, pModel, start);

    // Refresh model after first split
    const midModels = buildParagraphModels(docXml);
    const midPModel = midModels.find((m) => m.index === pIndex);
    if (!midPModel) return;

    splitParagraphAtOffset(docXml, midPModel, delEnd);

    // Refresh model after second split
    const finalModels = buildParagraphModels(docXml);
    const finalPModel = finalModels.find((m) => m.index === pIndex);
    if (!finalPModel) return;

    // Collect all runs strictly inside [start, delEnd)
    const affectedRuns: Element[] = [];
    const seenRuns = new Set<Element>();

    for (let c = start; c < delEnd; c++) {
      const loc = finalPModel.charMap[c];
      if (loc && !seenRuns.has(loc.run)) {
        seenRuns.add(loc.run);
        affectedRuns.push(loc.run);
      }
    }

    if (affectedRuns.length === 0) return;

    const firstRun = affectedRuns[0];
    if (!firstRun || !firstRun.parentNode) return;
    const parentNode = firstRun.parentNode;

    // Create <w:del>
    const delEl = docXml.createElement('w:del');
    delEl.setAttribute('w:id', String(nextId()));
    delEl.setAttribute('w:author', author);
    delEl.setAttribute('w:date', date);

    parentNode.insertBefore(delEl, firstRun);

    // Move affected runs into <w:del>, converting <w:t> to <w:delText>
    for (const r of affectedRuns) {
      const tEls = Array.from(r.getElementsByTagName('w:t'));
      for (const tEl of tEls) {
        const delTextEl = docXml.createElement('w:delText');
        delTextEl.setAttribute('xml:space', 'preserve');
        delTextEl.textContent = tEl.textContent;
        tEl.parentNode?.replaceChild(delTextEl, tEl);
      }
      delEl.appendChild(r);
    }

    // Insert <w:ins> if insText is present
    if (insText.length > 0) {
      const insEl = docXml.createElement('w:ins');
      insEl.setAttribute('w:id', String(nextId()));
      insEl.setAttribute('w:author', author);
      insEl.setAttribute('w:date', date);

      const insRun = docXml.createElement('w:r');
      // Clone w:rPr from first affected run
      const rPr = firstRun.getElementsByTagName('w:rPr')[0];
      if (rPr) {
        insRun.appendChild(rPr.cloneNode(true));
      }

      const tEl = docXml.createElement('w:t');
      tEl.setAttribute('xml:space', 'preserve');
      tEl.textContent = insText;
      insRun.appendChild(tEl);

      insEl.appendChild(insRun);

      // Insert immediately after <w:del>
      if (delEl.nextSibling) {
        parentNode.insertBefore(insEl, delEl.nextSibling);
      } else {
        parentNode.appendChild(insEl);
      }
    }
  } else if (insText.length > 0) {
    // Pure insertion
    splitParagraphAtOffset(docXml, pModel, start);

    const freshModels = buildParagraphModels(docXml);
    const freshPModel = freshModels.find((m) => m.index === pIndex);
    if (!freshPModel) return;

    const loc = freshPModel.charMap[start] ?? freshPModel.charMap[start - 1];
    const targetRun = loc?.run;
    if (!targetRun || !targetRun.parentNode) return;
    const parentNode = targetRun.parentNode;

    const insEl = docXml.createElement('w:ins');
    insEl.setAttribute('w:id', String(nextId()));
    insEl.setAttribute('w:author', author);
    insEl.setAttribute('w:date', date);

    const insRun = docXml.createElement('w:r');
    const rPr = targetRun.getElementsByTagName('w:rPr')[0];
    if (rPr) {
      insRun.appendChild(rPr.cloneNode(true));
    }

    const tEl = docXml.createElement('w:t');
    tEl.setAttribute('xml:space', 'preserve');
    tEl.textContent = insText;
    insRun.appendChild(tEl);

    insEl.appendChild(insRun);

    // If at start of run, insert before targetRun; else after
    const isAtStart = freshPModel.charMap[start]?.offsetInNode === 0;
    if (isAtStart) {
      parentNode.insertBefore(insEl, targetRun);
    } else {
      parentNode.insertBefore(insEl, targetRun.nextSibling);
    }
  }
}

function splitParagraphAtOffset(
  docXml: Document,
  pModel: ParagraphModel,
  charOffset: number,
): void {
  if (charOffset <= 0 || charOffset >= pModel.text.length) {
    return;
  }

  const loc = pModel.charMap[charOffset];
  if (!loc || loc.offsetInNode === 0 || !loc.textNode) {
    // Already on a run/text boundary
    return;
  }

  const runEl = loc.run;
  const parent = runEl.parentNode;
  if (!parent) return;

  const fullText = loc.textNode.textContent ?? '';
  const splitPos = loc.offsetInNode;
  const headText = fullText.slice(0, splitPos);
  const tailText = fullText.slice(splitPos);

  // Update original text node to headText
  loc.textNode.textContent = headText;
  const headTEl = loc.textNode.parentNode as Element | null;
  if (headTEl) {
    headTEl.setAttribute('xml:space', 'preserve');
  }

  // Clone run for tail
  const tailRun = runEl.cloneNode(true) as Element;
  const tailTEls = tailRun.getElementsByTagName('w:t');
  if (tailTEls[0]) {
    tailTEls[0].textContent = tailText;
    tailTEls[0].setAttribute('xml:space', 'preserve');
  }

  // Insert tailRun immediately after runEl
  parent.insertBefore(tailRun, runEl.nextSibling);
}
