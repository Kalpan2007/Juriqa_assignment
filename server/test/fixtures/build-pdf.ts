/**
 * Builds real PDF files in memory for tests.
 *
 * Why generate rather than only use real contracts: these fixtures let a test state exactly
 * what the page contains and exactly where, so an extraction bug (a glued word, a missing
 * newline, an off-by-one offset) is provable rather than eyeballed. Real contracts are still
 * needed for layout and font variety — this covers the mechanics.
 */

export interface TextRun {
  /** Text to draw. */
  text: string;
  /** Absolute position in PDF units, origin bottom-left. */
  x: number;
  y: number;
  /** Font size; the extractor's gap threshold is relative to it. */
  size?: number;
}

export interface PdfPageSpec {
  /** Runs drawn in order. Items come back from pdf.js in this order. */
  runs: TextRun[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 612;
const DEFAULT_HEIGHT = 792;

/** Escapes the characters that terminate a PDF string literal. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function contentStreamFor(page: PdfPageSpec): string {
  const parts: string[] = ['BT'];
  let currentSize = 0;

  for (const run of page.runs) {
    const size = run.size ?? 12;
    if (size !== currentSize) {
      parts.push(`/F1 ${size} Tf`);
      currentSize = size;
    }
    // Absolute positioning via the text matrix, so each run lands exactly where asked.
    parts.push(`1 0 0 1 ${run.x} ${run.y} Tm`);
    parts.push(`(${escapePdfText(run.text)}) Tj`);
  }

  parts.push('ET');
  return parts.join('\n');
}

/** Builds a multi-page PDF. */
export function buildPdf(pages: PdfPageSpec[]): Buffer {
  const objects: string[] = [];
  // 1 = catalog, 2 = pages, 3 = font, then per page: page object + content stream.
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  pages.forEach((page, index) => {
    const contentId = pageObjectIds[index]! + 1;
    const width = page.width ?? DEFAULT_WIDTH;
    const height = page.height ?? DEFAULT_HEIGHT;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const stream = contentStreamFor(page);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** A page of ordinary contract lines, one per line, top to bottom. */
export function textPage(lines: string[], size = 12): PdfPageSpec {
  return {
    runs: lines.map((text, index) => ({ text, x: 72, y: 700 - index * (size * 1.5), size })),
  };
}

/** A page with no text at all — what a scanned page looks like to a text extractor. */
export function emptyPage(): PdfPageSpec {
  return { runs: [] };
}

/** Builds a contract of `pageCount` pages, each carrying a numbered, findable marker. */
export function buildLongContract(pageCount: number): Buffer {
  const pages: PdfPageSpec[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    pages.push(
      textPage([
        'CONFIDENTIAL - DRAFT',
        `${page}. Clause ${page} heading`,
        `This clause ${page} states that the parties shall perform their obligations.`,
        `The marker for this page is MARKER-${page}-END.`,
        `Page ${page} of ${pageCount}`,
      ]),
    );
  }
  return buildPdf(pages);
}
