import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { buildParagraphModels } from './paragraph-model';
import { AppError } from '../../../core/errors/app-error';

export function simulateAccept(docXml: Document): Document {
  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(docXml);
  const parser = new DOMParser();
  const clone = parser.parseFromString(xmlStr, 'application/xml');

  // 1. Remove all w:del elements
  const dels = Array.from(clone.getElementsByTagName('w:del'));
  for (const del of dels) {
    del.parentNode?.removeChild(del);
  }

  // 2. Unwrap all w:ins elements
  const inss = Array.from(clone.getElementsByTagName('w:ins'));
  for (const ins of inss) {
    const parent = ins.parentNode;
    if (!parent) continue;
    while (ins.firstChild) {
      parent.insertBefore(ins.firstChild, ins);
    }
    parent.removeChild(ins);
  }

  return clone;
}

export function simulateReject(docXml: Document): Document {
  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(docXml);
  const parser = new DOMParser();
  const clone = parser.parseFromString(xmlStr, 'application/xml');

  // 1. Remove all w:ins elements
  const inss = Array.from(clone.getElementsByTagName('w:ins'));
  for (const ins of inss) {
    ins.parentNode?.removeChild(ins);
  }

  // 2. Unwrap all w:del elements and convert w:delText to w:t
  const dels = Array.from(clone.getElementsByTagName('w:del'));
  for (const del of dels) {
    const parent = del.parentNode;
    if (!parent) continue;

    // Convert delText to t
    const delTexts = Array.from(del.getElementsByTagName('w:delText'));
    for (const dt of delTexts) {
      const t = clone.createElement('w:t');
      if (dt.getAttribute('xml:space')) {
        t.setAttribute('xml:space', dt.getAttribute('xml:space') ?? 'preserve');
      }
      t.textContent = dt.textContent;
      dt.parentNode?.replaceChild(t, dt);
    }

    while (del.firstChild) {
      parent.insertBefore(del.firstChild, del);
    }
    parent.removeChild(del);
  }

  return clone;
}

export function validateRedline(
  originalDocXml: Document,
  redlinedDocXml: Document,
  expectedAcceptedTexts: Map<number, string>,
): void {
  // 1. Reject all must restore original paragraph texts
  const rejectedDoc = simulateReject(redlinedDocXml);
  const originalModels = buildParagraphModels(originalDocXml);
  const rejectedModels = buildParagraphModels(rejectedDoc);

  if (originalModels.length !== rejectedModels.length) {
    throw new AppError(
      'REDLINE_SELF_CHECK_FAILED',
      500,
      'Self-check failed: paragraph count altered.',
    );
  }

  for (let i = 0; i < originalModels.length; i++) {
    const orig = originalModels[i];
    const rej = rejectedModels[i];
    if (orig?.text !== rej?.text) {
      throw new AppError(
        'REDLINE_SELF_CHECK_FAILED',
        500,
        `Self-check failed: Reject All did not restore original text for paragraph ${i}.`,
      );
    }
  }

  // 2. Accept all must produce expected accepted text
  const acceptedDoc = simulateAccept(redlinedDocXml);
  const acceptedModels = buildParagraphModels(acceptedDoc);

  for (const [pIndex, expectedText] of expectedAcceptedTexts.entries()) {
    const actual = acceptedModels[pIndex]?.text;
    if (actual !== undefined && normalizeQuotes(actual) !== normalizeQuotes(expectedText)) {
      throw new AppError(
        'REDLINE_SELF_CHECK_FAILED',
        500,
        `Self-check failed: Accept All text mismatch for paragraph ${pIndex}.\nExpected: "${expectedText}"\nActual:   "${actual}"`,
      );
    }
  }
}

function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}
