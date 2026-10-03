// Tries to open each PDF with pdf.js and reports pages, chars per page, or the error name.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  try {
    const data = new Uint8Array(readFileSync(f));
    if (data.length === 0) { console.log(f, '-> EMPTY FILE (0 bytes)'); continue; }
    const doc = await getDocument({ data, verbosity: 0 }).promise;
    const chars = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      chars.push(tc.items.reduce((a, i) => a + i.str.trim().length, 0));
    }
    const low = chars.map((c, i) => c < 10 ? i + 1 : null).filter(Boolean);
    console.log(f, `-> pages=${doc.numPages} avgChars=${Math.round(chars.reduce((a,b)=>a+b,0)/chars.length)} pagesUnder10chars=[${low.join(',')}]`);
  } catch (e) { console.log(f, '-> ERROR', e.name, '-', e.message.slice(0, 80)); }
}
