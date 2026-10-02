/**
 * Extracts text from a PDF with the offsets and geometry everything else depends on
 * (ARCHITECTURE section 4).
 *
 * Two things make this harder than "read the text":
 *
 * 1. **Separators belong to no item.** pdf.js returns positioned fragments, not lines. Joining
 *    them naively produces `theCompany`; inserting a space everywhere produces `A E D`. So a
 *    space is added only where there is a real horizontal gap, and a newline only where pdf.js
 *    reports one. Every character of `fullText` is therefore either an item's own text or a
 *    separator we chose deliberately — which is what lets `fullText.slice(item.start, item.end)`
 *    round-trip exactly.
 *
 * 2. **Geometry must be kept per item.** The browser highlights a quote by mapping offsets to
 *    the rendered text layer; when the layer does not match, it falls back to these boxes. Both
 *    paths need the same item list the server built, which is why the client runs the same
 *    pinned pdf.js version.
 *
 * pdf.js is ESM-only and this server is CommonJS, so it is loaded with `await import()` — and
 * its asset directories must be forward-slash paths ending in `/` (decision D25).
 */
import path from 'node:path';

/** A space is inserted when the gap between two items exceeds this fraction of font height. */
const GAP_RATIO = 0.15;

/** Pages are separated by a blank line. */
const PAGE_SEPARATOR = '\n\n';

export interface ExtractedItem {
  /** Absolute offset of this item's text in `fullText`. */
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEol: boolean;
}

export interface ExtractedPage {
  number: number;
  startOffset: number;
  endOffset: number;
  width: number;
  height: number;
  textChars: number;
  items: ExtractedItem[];
}

export interface PdfExtraction {
  fullText: string;
  pages: ExtractedPage[];
  pageCount: number;
}

export type PdfExtractionFailure =
  | { reason: 'ENCRYPTED_PDF' }
  | { reason: 'CORRUPT_FILE'; detail: string }
  | { reason: 'TOO_MANY_PAGES'; pageCount: number };

export class PdfExtractionError extends Error {
  constructor(readonly failure: PdfExtractionFailure) {
    super(failure.reason);
    this.name = 'PdfExtractionError';
  }
}

export interface PdfExtractOptions {
  maxPages: number;
  /** Called after each page so the UI can show "Extracting page 42 of 150". */
  onProgress?: (page: number, total: number) => void | Promise<void>;
}

/** Resolves a pdfjs-dist asset directory in the only form pdf.js 6 accepts (decision D25). */
function pdfjsAssetPath(folder: 'standard_fonts' | 'cmaps'): string {
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return path.join(pkgDir, folder).split(path.sep).join('/') + '/';
}

export async function extractPdf(
  buffer: Buffer,
  options: PdfExtractOptions,
): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdf.js takes ownership of the array it is given and will detach it, so it gets a copy.
  const data = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data,
    standardFontDataUrl: pdfjsAssetPath('standard_fonts'),
    cMapUrl: pdfjsAssetPath('cmaps'),
    cMapPacked: true,
    useWorkerFetch: false,
    useSystemFonts: false,
  });

  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    await safeDestroy(loadingTask);
    throw toExtractionError(error);
  }

  try {
    if (doc.numPages > options.maxPages) {
      throw new PdfExtractionError({ reason: 'TOO_MANY_PAGES', pageCount: doc.numPages });
    }

    let fullText = '';
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (pageNumber > 1) fullText += PAGE_SEPARATOR;

      const pageStart = fullText.length;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const items: ExtractedItem[] = [];
      let previous: { endX: number; y: number; height: number } | null = null;

      for (const raw of textContent.items) {
        if (!('str' in raw)) continue; // TextMarkedContent carries no text

        const { str, hasEOL, width, height, transform } = raw;
        const x = transform[4] ?? 0;
        const y = transform[5] ?? 0;

        if (str.length > 0 && previous !== null) {
          fullText += separatorBetween(previous, { x, y }, fullText, str);
        }

        const start = fullText.length;
        fullText += str;
        items.push({
          start,
          end: fullText.length,
          x,
          y,
          width,
          height,
          hasEol: hasEOL === true,
        });

        if (hasEOL === true) {
          fullText += '\n';
          previous = null; // a new line: no horizontal gap to measure against
        } else if (str.length > 0) {
          previous = { endX: x + width, y, height };
        }
      }

      // Free the page's internal caches; a 150-page document would otherwise grow unbounded.
      page.cleanup();

      pages.push({
        number: pageNumber,
        startOffset: pageStart,
        endOffset: fullText.length,
        width: viewport.width,
        height: viewport.height,
        textChars: countReadableChars(fullText.slice(pageStart)),
        items,
      });

      await options.onProgress?.(pageNumber, doc.numPages);
    }

    return { fullText, pages, pageCount: doc.numPages };
  } finally {
    // v6 removed PDFDocumentProxy.destroy(); the loading task owns cleanup (decision D25).
    await safeDestroy(loadingTask);
  }
}

/**
 * Decides what goes between two items on the same page.
 *
 * Only a visible gap produces a space. The threshold is relative to font height because an
 * absolute one would insert spaces inside words in a 6pt footnote and miss them in a 24pt
 * heading.
 */
function separatorBetween(
  previous: { endX: number; y: number; height: number },
  current: { x: number; y: number },
  fullText: string,
  currentStr: string,
): string {
  // A different baseline means pdf.js did not flag an EOL but the text moved line anyway
  // (common in multi-column layouts).
  const sameLine = Math.abs(current.y - previous.y) < Math.max(1, previous.height * 0.5);
  if (!sameLine) return '\n';

  const lastChar = fullText[fullText.length - 1];
  const firstChar = currentStr[0];
  // Never double up: if either side already provides whitespace, adding more would corrupt
  // the offsets the quote verifier normalises against.
  if (isSpaceLike(lastChar) || isSpaceLike(firstChar)) return '';

  const gap = current.x - previous.endX;
  return gap > previous.height * GAP_RATIO ? ' ' : '';
}

function isSpaceLike(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/** Characters that count as readable text, for the scanned-page decision. */
function countReadableChars(pageText: string): number {
  return pageText.replace(/\s/g, '').length;
}

function toExtractionError(error: unknown): PdfExtractionError {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);

  // pdf.js throws PasswordException when a document needs a password to open.
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new PdfExtractionError({ reason: 'ENCRYPTED_PDF' });
  }
  return new PdfExtractionError({ reason: 'CORRUPT_FILE', detail: message });
}

async function safeDestroy(loadingTask: { destroy: () => Promise<void> }): Promise<void> {
  try {
    await loadingTask.destroy();
  } catch {
    // Destroying an already-failed task can throw; it is not worth failing the job over.
  }
}
