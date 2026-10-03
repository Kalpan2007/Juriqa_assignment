// Extracts per-page text with pdf.js (same engine + version the app uses).
// Usage: node extract.mjs file.pdf > pages.json
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fontDir = require.resolve('pdfjs-dist/package.json').replace('package.json', 'standard_fonts/');

const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await getDocument({ data, standardFontDataUrl: fontDir, verbosity: 0 }).promise;
const pages = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  let text = '';
  for (const it of tc.items) { text += it.str; if (it.hasEOL) text += '\n'; else text += ''; }
  pages.push({ page: p, items: tc.items.length, text });
}
process.stdout.write(JSON.stringify({ numPages: doc.numPages, pages }));
