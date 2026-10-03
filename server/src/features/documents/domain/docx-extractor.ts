/**
 * Extracts text and a reading view from a .docx (ARCHITECTURE section 4).
 *
 * The pipeline is `mammoth → sanitize-html → annotate offsets`, strictly in that order.
 * Order matters: the offsets stamped on each block must describe the HTML that is actually
 * STORED and rendered. Annotating before sanitising would let the sanitiser remove an element
 * afterwards and silently shift every later offset, putting every DOCX highlight in the wrong
 * place.
 *
 * The block-text rule itself lives in `@ca/shared` because the browser has to reproduce it
 * character for character when it maps a quote back to the DOM.
 */
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { parse, type HTMLElement } from 'node-html-parser';
import { DOCX_BLOCK_TAGS, joinDocxBlocks, normalizeDocxBlockText } from '@ca/shared';

export interface DocxExtraction {
  fullText: string;
  /** Sanitised HTML with `data-start` / `data-end` on every leaf block. */
  html: string;
  /** Warnings mammoth produced (unsupported styles, dropped elements). */
  messages: string[];
}

export type DocxExtractionFailure =
  | { reason: 'ENCRYPTED_DOCX' }
  | { reason: 'CORRUPT_FILE'; detail: string };

export class DocxExtractionError extends Error {
  constructor(readonly failure: DocxExtractionFailure) {
    super(failure.reason);
    this.name = 'DocxExtractionError';
  }
}

/**
 * Sanitiser allow-list (ARCHITECTURE section 3.3).
 *
 * Document content is untrusted input — a .docx can carry anything. Only the tags needed to
 * read a contract survive, and the only attributes kept are the two we add ourselves plus
 * table spans. Links become plain text: their text is preserved, the href is not, so no
 * document can turn the reading view into a set of outbound links.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'br',
    'span',
    'sup',
    'sub',
  ],
  allowedAttributes: {
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  // Drop these elements AND their contents; everything else keeps its text.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
  allowedSchemes: [],
};

/** Applies the allow-list. Exported so the policy itself can be tested directly. */
export function sanitizeDocxHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

export async function extractDocx(buffer: Buffer): Promise<DocxExtraction> {
  let rawHtml: string;
  let messages: string[];

  try {
    const result = await mammoth.convertToHtml({ buffer });
    rawHtml = result.value;
    messages = result.messages.map((message) => `${message.type}: ${message.message}`);
  } catch (error) {
    throw toExtractionError(error);
  }

  const sanitized = sanitizeDocxHtml(rawHtml);
  const { html, fullText } = annotateBlocks(sanitized);

  return { fullText, html, messages };
}

/**
 * Stamps `data-start` / `data-end` on every leaf block and builds `fullText` from them.
 *
 * "Leaf" is the important word. mammoth emits `<td><p>Service</p></td>`, and `td` and `p` are
 * both block tags — counting both would put every table cell's text into `fullText` twice and
 * desynchronise every offset after it. So a block only counts when it contains no other block.
 */
export function annotateBlocks(sanitizedHtml: string): { html: string; fullText: string } {
  const root = parse(sanitizedHtml);

  // Lift nested lists out of parent list items so parent heading text is preserved as its own block.
  const nestedLists = root.querySelectorAll('li > ol, li > ul');
  nestedLists.reverse().forEach((list) => {
    const parentLi = list.parentNode;
    if (parentLi) {
      parentLi.insertAdjacentHTML('afterend', list.toString());
      list.remove();
    }
  });

  const selector = DOCX_BLOCK_TAGS.join(',');
  const candidates = root.querySelectorAll(selector);

  const leafBlocks = candidates.filter(
    (element: HTMLElement) => element.querySelectorAll(selector).length === 0,
  );

  const texts = leafBlocks.map((element) => normalizeDocxBlockText(element.text));
  const { fullText, ranges } = joinDocxBlocks(texts);

  leafBlocks.forEach((element, index) => {
    const range = ranges[index];
    if (range === undefined) return;
    element.setAttribute('data-start', String(range.start));
    element.setAttribute('data-end', String(range.end));
  });

  return { html: root.toString(), fullText };
}

function toExtractionError(error: unknown): DocxExtractionError {
  const message = error instanceof Error ? error.message : String(error);

  // A password-protected .docx is an OLE2 container, so the sniffer normally catches it first.
  // This is the backstop for one that slips through (e.g. an encrypted inner package).
  if (/encrypt|password/i.test(message)) {
    return new DocxExtractionError({ reason: 'ENCRYPTED_DOCX' });
  }
  return new DocxExtractionError({ reason: 'CORRUPT_FILE', detail: message });
}
