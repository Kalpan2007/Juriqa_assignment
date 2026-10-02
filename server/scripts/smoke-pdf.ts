/**
 * F0 smoke test: prove pdf.js works in Node before slice F1 is built on it.
 *
 * This is the riskiest assumption in the stack (ARCHITECTURE section 1):
 *  - pdfjs-dist has been ESM-only since v4, while this server is CommonJS (decision D1/D3),
 *    so it must be reached with `await import()`, never `require`.
 *  - v6 needs `standardFontDataUrl`/`cMapUrl` as file:// URLs ENDING IN "/". A native Windows
 *    path throws `Invalid factory url` (decision D25).
 *  - v6 removed `PDFDocumentProxy.destroy()`; cleanup is `loadingTask.destroy()` (decision D25).
 *
 * It prints the first text items with the geometry that section 4's separator rules and
 * section 8's geometric fallback depend on, and fails loudly if a font warning appears.
 *
 * Usage: npm run smoke:pdf -w @ca/server [-- path/to/file.pdf]
 */
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolves pdfjs-dist's asset directories into the ONE form pdf.js 6 accepts in Node.
 *
 * Verified by trying all three (decision D25):
 *   - `file://` URL          → font fetch fails; Node's fetch has no file: support
 *   - native path with `\`   → throws `Invalid factory url: ... must include trailing slash`
 *   - forward slashes + `/`  → works
 * On Linux `path.sep` is already `/`, so this is correct on both platforms.
 */
function pdfjsAssetPath(folder: 'standard_fonts' | 'cmaps'): string {
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return path.join(pkgDir, folder).split(path.sep).join('/') + '/';
}

/** A tiny valid PDF, so the script works with no fixture present. */
function buildSamplePdf(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const stream =
    'BT /F1 12 Tf 72 700 Td (The Liability Cap is AED 100,000.) Tj 0 -20 Td (Governing law: DIFC.) Tj ET';
  objects.push(`5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function main(): Promise<void> {
  const fixtureArg = process.argv[2];
  const data = fixtureArg
    ? new Uint8Array(fs.readFileSync(fixtureArg))
    : new Uint8Array(buildSamplePdf());

  console.log(`source        : ${fixtureArg ?? '(built-in sample PDF)'}`);
  console.log(`node          : ${process.version}`);

  // Captured so a font/cmap misconfiguration is a FAILURE, not a line nobody reads.
  const warnings: string[] = [];
  const originalWarn = console.warn;

  // ESM-only package, loaded from CommonJS. This is the line the whole stack depends on.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  console.log(`pdfjs version : ${pdfjs.version}`);

  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  const loadingTask = pdfjs.getDocument({
    data,
    standardFontDataUrl: pdfjsAssetPath('standard_fonts'),
    cMapUrl: pdfjsAssetPath('cmaps'),
    cMapPacked: true,
    useWorkerFetch: false,
    useSystemFonts: false,
  });

  try {
    const doc = await loadingTask.promise;
    console.log(`pages         : ${doc.numPages}`);

    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    console.log(`page 1 size   : ${viewport.width} x ${viewport.height}`);

    const textContent = await page.getTextContent();
    // getTextContent returns TextItem | TextMarkedContent; only TextItem carries text.
    const items = textContent.items.filter(
      (item): item is Extract<typeof item, { str: string }> => 'str' in item,
    );
    console.log(`text items    : ${items.length}`);

    for (const item of items.slice(0, 8)) {
      const [, , , , x, y] = item.transform;
      console.log(
        `  ${JSON.stringify({
          str: item.str,
          eol: item.hasEOL ?? false,
          w: Number(item.width.toFixed(2)),
          h: item.height,
          x,
          y,
        })}`,
      );
    }

    // Text extraction alone never touches the font files, so the "no font warning" check
    // below would pass vacuously. getOperatorList is what actually loads them — and the
    // client renders pages to canvas, which needs them to work.
    await page.getOperatorList();

    page.cleanup();
    console.warn = originalWarn;

    if (items.length === 0) {
      throw new Error('No text items extracted — extraction is not working.');
    }
    if (warnings.length > 0) {
      throw new Error(`pdf.js emitted warnings (font/cmap setup is wrong):\n  ${warnings.join('\n  ')}`);
    }

    console.log('\nPASS: text, geometry and hasEOL extracted with no warnings.');
  } finally {
    console.warn = originalWarn;
    // v6: the loading task owns cleanup, not the document (decision D25).
    await loadingTask.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('\nFAIL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
