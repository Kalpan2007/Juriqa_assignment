import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import {
  annotateBlocks,
  extractDocx,
  sanitizeDocxHtml,
  DocxExtractionError,
} from '../domain/docx-extractor';
import { normalizeDocxBlockText } from '@ca/shared';

const FIXTURE = path.resolve(__dirname, '../../../../test/fixtures/contract.docx');

describe('annotateBlocks — offsets must address the stored HTML', () => {
  it('stamps data-start/data-end on a simple paragraph', () => {
    const { html, fullText } = annotateBlocks('<p>Hello world.</p>');

    expect(fullText).toBe('Hello world.');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('data-end="12"');
  });

  it('every block slices back to its own text', () => {
    const { html, fullText } = annotateBlocks(
      '<h1>Title</h1><p>First para.</p><p>Second para.</p>',
    );

    for (const element of parse(html).querySelectorAll('[data-start]')) {
      const start = Number(element.getAttribute('data-start'));
      const end = Number(element.getAttribute('data-end'));
      expect(fullText.slice(start, end)).toBe(normalizeDocxBlockText(element.text));
    }
  });

  it('counts a table cell ONCE, not twice', () => {
    /**
     * mammoth emits <td><p>Service</p></td> and both td and p are block tags. Counting both
     * would put the cell text into fullText twice and shift every later offset — so only the
     * innermost block counts.
     */
    const { html, fullText } = annotateBlocks('<table><tr><td><p>Service</p></td></tr></table>');

    expect(fullText).toBe('Service');
    const annotated = parse(html).querySelectorAll('[data-start]');
    expect(annotated).toHaveLength(1);
    expect(annotated[0]!.tagName.toLowerCase()).toBe('p');
  });

  it('counts a bare table cell when it has no inner paragraph', () => {
    const { fullText } = annotateBlocks('<table><tr><td>Fee</td><td>AED 5,000</td></tr></table>');

    expect(fullText).toBe('Fee\nAED 5,000');
  });

  it('keeps inline formatting in the HTML but not in the text', () => {
    const { html, fullText } = annotateBlocks('<p>The cap is <strong>AED 100,000</strong> here.</p>');

    expect(fullText).toBe('The cap is AED 100,000 here.');
    expect(html).toContain('<strong>');
  });

  it('decodes entities so offsets count real characters', () => {
    // If the offsets counted "&amp;" as 5 characters, every highlight after it would be wrong.
    const { fullText } = annotateBlocks('<p>Alpha &amp; Beta</p>');

    expect(fullText).toBe('Alpha & Beta');
  });

  it('handles an empty document', () => {
    expect(annotateBlocks('')).toEqual({ html: '', fullText: '' });
  });

  it('keeps an empty paragraph as a zero-length block so block N stays block N', () => {
    const { fullText, html } = annotateBlocks('<p>A</p><p></p><p>B</p>');

    expect(fullText).toBe('A\n\nB');
    expect(parse(html).querySelectorAll('[data-start]')).toHaveLength(3);
  });
});

describe('extractDocx — against a real .docx', () => {
  it('extracts the contract text', async () => {
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    expect(result.fullText).toContain('SERVICES AGREEMENT');
    expect(result.fullText).toContain('Alpha FZ-LLC');
    expect(result.fullText).toContain('AED 100,000');
    expect(result.fullText).toContain('Governed by DIFC law.');
  });

  it('joins a sentence split across runs by bold formatting', async () => {
    // In the .docx this sentence is three runs: text, bold "AED 100,000", text. If the runs
    // were joined wrongly the quote verifier would never match the sentence.
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    expect(result.fullText).toContain('The total liability shall not exceed AED 100,000 in aggregate.');
    expect(result.fullText).toContain('This Agreement is made between Alpha FZ-LLC and Beta DMCC.');
  });

  it('keeps a hyperlink’s text but drops the link itself', async () => {
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    expect(result.fullText).toContain('See the DIFC courts for details.');
    // Untrusted document content must not become an outbound link in the reading view.
    expect(result.html).not.toContain('difccourts.ae');
    expect(result.html).not.toContain('<a');
  });

  it('keeps the table as readable blocks', async () => {
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    expect(result.fullText).toContain('Consulting');
    expect(result.fullText).toContain('AED 5,000');
    expect(result.html).toContain('<table>');
  });

  it('preserves bold runs in the reading view', async () => {
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    expect(result.html).toContain('<strong>Alpha FZ-LLC</strong>');
  });

  it('every annotated block slices back out of fullText', async () => {
    const { html, fullText } = await extractDocx(fs.readFileSync(FIXTURE));

    const blocks = parse(html).querySelectorAll('[data-start]');
    expect(blocks.length).toBeGreaterThan(5);

    for (const element of blocks) {
      const start = Number(element.getAttribute('data-start'));
      const end = Number(element.getAttribute('data-end'));
      expect(fullText.slice(start, end)).toBe(normalizeDocxBlockText(element.text));
    }
  });

  it('reports mammoth warnings rather than hiding them', async () => {
    const result = await extractDocx(fs.readFileSync(FIXTURE));

    // The fixture references an undefined Heading1 style on purpose.
    expect(result.messages.some((m) => m.includes('Heading1'))).toBe(true);
  });
});

describe('sanitizeDocxHtml — document content is untrusted', () => {
  it('strips a script tag and its contents', () => {
    const clean = sanitizeDocxHtml('<p>Safe text</p><script>alert(1)</script><p>More</p>');

    expect(clean).not.toContain('script');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('Safe text');
  });

  it('strips an event handler attribute', () => {
    const clean = sanitizeDocxHtml('<p onclick="steal()">Click</p>');

    expect(clean).not.toContain('onclick');
    expect(clean).toContain('Click');
  });

  it('strips an img with a javascript source', () => {
    const clean = sanitizeDocxHtml('<p>Text<img src="javascript:alert(1)"></p>');

    expect(clean).not.toContain('javascript');
    expect(clean).not.toContain('<img');
  });

  it('keeps the formatting a contract actually needs', () => {
    const clean = sanitizeDocxHtml(
      '<h2>Clause</h2><p>A <strong>bold</strong> and <em>italic</em> term</p>' +
        '<table><tr><td colspan="2">Cell</td></tr></table><ul><li>Point</li></ul>',
    );

    expect(clean).toContain('<h2>');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<em>');
    expect(clean).toContain('colspan="2"');
    expect(clean).toContain('<li>');
  });
});

describe('extractDocx — failures', () => {
  it('rejects a buffer that is not a .docx', async () => {
    await expect(extractDocx(Buffer.from('not a docx at all'))).rejects.toBeInstanceOf(
      DocxExtractionError,
    );
  });

  it('rejects an empty buffer', async () => {
    await expect(extractDocx(Buffer.alloc(0))).rejects.toBeInstanceOf(DocxExtractionError);
  });
});
