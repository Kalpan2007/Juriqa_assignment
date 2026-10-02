/**
 * The ONE rule for turning a DOCX block element into text.
 *
 * This exists because the same rule has to run twice, in two different places, and produce
 * byte-identical results:
 *   - on the server, to build `Document.fullText` and stamp `data-start` / `data-end` on every
 *     block of the stored HTML;
 *   - in the browser, to walk those blocks and map a quote's character offsets back to DOM
 *     positions for highlighting.
 * If the two drifted by a single space, every DOCX highlight would land in the wrong place.
 * So the rule lives here, in `shared/`, and both sides import it (ARCHITECTURE section 4).
 */

/** Element tags treated as blocks. Each one contributes its own line to `fullText`. */
export const DOCX_BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'] as const;

export type DocxBlockTag = (typeof DOCX_BLOCK_TAGS)[number];

/** Blocks are joined with a single newline. */
export const DOCX_BLOCK_SEPARATOR = '\n';

export function isDocxBlockTag(tagName: string): tagName is DocxBlockTag {
  return (DOCX_BLOCK_TAGS as readonly string[]).includes(tagName.toLowerCase());
}

/**
 * Normalises the text of one block.
 *
 * Deliberately minimal: collapse every run of whitespace (including the newlines mammoth
 * leaves between inline elements and NBSP, which Word uses liberally) to a single space, then
 * trim the ends. Characters are never changed and nothing is removed, so offsets into the
 * result still address real words — which is what the quote verifier relies on.
 */
export function normalizeDocxBlockText(raw: string): string {
  return raw.replace(/[\s ]+/g, ' ').trim();
}

/**
 * Joins block texts into the document's full text, returning each block's offset range.
 *
 * Empty blocks (an empty paragraph used for spacing) are kept as zero-length entries so the
 * Nth block in the DOM is always the Nth entry here — dropping them would desynchronise the
 * browser's block walk from the server's.
 */
export function joinDocxBlocks(blockTexts: readonly string[]): {
  fullText: string;
  ranges: Array<{ start: number; end: number }>;
} {
  const ranges: Array<{ start: number; end: number }> = [];
  let fullText = '';

  blockTexts.forEach((text, index) => {
    if (index > 0) fullText += DOCX_BLOCK_SEPARATOR;
    const start = fullText.length;
    fullText += text;
    ranges.push({ start, end: fullText.length });
  });

  return { fullText, ranges };
}
