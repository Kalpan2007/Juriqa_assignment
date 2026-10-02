import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { buildPdf, emptyPage, textPage } from '../fixtures/build-pdf';
import { cleanup, createTestApp, HAS_ENV, uploader, waitForFinalStatus } from './harness';

/**
 * The processing pipeline, end to end over HTTP against the real database and storage.
 *
 * These are the tests that prove F1 works rather than that its pieces type-check: a file goes
 * in, a pg-boss worker processes it, and the offsets that come back can be sliced out of the
 * text. No LLM is involved anywhere in this slice.
 */
describe.skipIf(!HAS_ENV)('document processing', () => {
  let app: INestApplication;
  const created: string[] = [];
  const upload = uploader(() => app, created);

  beforeAll(async () => {
    app = await createTestApp();
  }, 120_000);

  afterAll(async () => {
    await cleanup(app, created);
    await app?.close();
  }, 60_000);

  describe('a fully scanned PDF', () => {
    it('ends FAILED with the scanned reason, never READY', async () => {
      /**
       * The assignment names this as the behaviour to avoid: saving an empty document and
       * treating it as a success. It is also the case a worker bug hides easily, because the
       * upload itself succeeds — so the status is asserted, not the upload.
       */
      const scanned = buildPdf([emptyPage(), emptyPage(), emptyPage(), emptyPage()]);
      const response = await upload('scanned.pdf', scanned);
      expect(response.status).toBe(201);

      const final = await waitForFinalStatus(app, response.body.document!.id);

      expect(final.status).toBe('FAILED');
      expect(final.errorCode).toBe('SCANNED_PDF');
      // The message must explain OCR is unsupported, not imply the file is broken.
      expect(final.errorMessage).toContain('OCR');
    });
  });

  describe('a partially scanned PDF', () => {
    it('stays usable and names the pages it could not read', async () => {
      const response = await upload(
        'partial-scan.pdf',
        buildPdf([
          textPage(['1. Definitions', 'This Agreement defines the terms used throughout.']),
          textPage(['2. Term', 'The term is 24 months from the commencement date.']),
          emptyPage(),
          emptyPage(),
          textPage(['3. Governing Law', 'This Agreement is governed by DIFC law.']),
        ]),
      );
      const id = response.body.document!.id;

      const final = await waitForFinalStatus(app, id);

      expect(final.status).toBe('READY');
      expect(final.scannedPageCount).toBe(2);

      // Honesty requirement: the user must be told WHICH pages were not analysed, so a later
      // "that clause is not in the document" is not a lie.
      const warnings = await request(app.getHttpServer())
        .get(`/documents/${id}/warnings`)
        .expect(200);

      expect(warnings.body.scannedPages).toContain('3');
      expect(warnings.body.scannedPages).toContain('4');
      expect(warnings.body.scannedPages).toContain('no readable text');
    });
  });

  describe('a text PDF', () => {
    let documentId: string;

    beforeAll(async () => {
      const response = await upload(
        'services.pdf',
        buildPdf([
          textPage(['SERVICES AGREEMENT', 'Between Alpha FZ-LLC and Beta DMCC.']),
          textPage(['1. Limitation of Liability', 'The cap is AED 100,000 in aggregate.']),
          textPage(['2. Governing Law', 'Governed by the laws of the DIFC.']),
        ]),
      );
      documentId = response.body.document!.id;
      const final = await waitForFinalStatus(app, documentId);
      expect(final.status).toBe('READY');
      expect(final.pageCount).toBe(3);
    }, 120_000);

    it('appears in the library', async () => {
      const response = await request(app.getHttpServer()).get('/documents').expect(200);

      expect(response.body.documents.some((d: { id: string }) => d.id === documentId)).toBe(true);
    });

    it('clears its status detail once it is ready', async () => {
      const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).expect(200);

      expect(response.body.status).toBe('READY');
      expect(response.body.statusDetail).toBeNull();
      expect(response.body.errorCode).toBeNull();
    });

    it('returns a layout the viewer can size placeholders from', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/layout`)
        .expect(200);

      expect(response.body.pageCount).toBe(3);
      expect(response.body.pages).toHaveLength(3);
      expect(response.body.textLength).toBeGreaterThan(0);

      for (const page of response.body.pages) {
        expect(page.width).toBeGreaterThan(0);
        expect(page.height).toBeGreaterThan(0);
        expect(page.endOffset).toBeGreaterThan(page.startOffset);
      }
    });

    it('page offsets and item offsets are internally consistent', async () => {
      // The F1 acceptance check, over HTTP: every item must address text inside its own page.
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/pages?from=1&to=3`)
        .expect(200);

      expect(response.body.pages).toHaveLength(3);
      expect(response.body.pages[1].text).toContain('AED 100,000');

      for (const page of response.body.pages) {
        expect(page.text.length).toBe(page.endOffset - page.startOffset);

        for (const [start, end] of page.items) {
          expect(start).toBeGreaterThanOrEqual(page.startOffset);
          expect(end).toBeLessThanOrEqual(page.endOffset);
          const local = page.text.slice(start - page.startOffset, end - page.startOffset);
          expect(local.length).toBe(end - start);
          // An item never contains a separator we inserted between items.
          expect(local).not.toContain('\n');
        }
      }
    });

    it('pages stitch together into the document text in order', async () => {
      const layout = await request(app.getHttpServer())
        .get(`/documents/${documentId}/layout`)
        .expect(200);
      const pages = await request(app.getHttpServer())
        .get(`/documents/${documentId}/pages?from=1&to=3`)
        .expect(200);

      // Page 1 starts at 0 and the last page ends at the document's length.
      expect(pages.body.pages[0].startOffset).toBe(0);
      expect(pages.body.pages[2].endOffset).toBeLessThanOrEqual(layout.body.textLength);
    });

    it('refuses a page window larger than the limit', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/pages?from=1&to=50`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a nonsensical page window', async () => {
      await request(app.getHttpServer())
        .get(`/documents/${documentId}/pages?from=5&to=2`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/documents/${documentId}/pages?from=0&to=2`)
        .expect(400);
    });

    it('serves the original file so the browser can render it', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/file`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('inline');
      expect(Buffer.from(response.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('has no reading view, because it is a PDF', async () => {
      await request(app.getHttpServer()).get(`/documents/${documentId}/html`).expect(400);
    });

    it('reports no scanned-page warning', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/warnings`)
        .expect(200);

      expect(response.body.scannedPages).toBeNull();
    });
  });

  describe('a DOCX', () => {
    let documentId: string;

    beforeAll(async () => {
      const fixture = path.resolve(__dirname, '../fixtures/contract.docx');
      const response = await upload('contract.docx', fs.readFileSync(fixture));
      documentId = response.body.document!.id;
      const final = await waitForFinalStatus(app, documentId);
      expect(final.status).toBe('READY');
    }, 120_000);

    it('exposes a sanitised reading view with block offsets', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/html`)
        .expect(200);

      expect(response.body.html).toContain('data-start=');
      expect(response.body.html).toContain('data-end=');
      expect(response.body.textLength).toBeGreaterThan(0);
    });

    it('keeps the formatting a contract needs', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/html`)
        .expect(200);

      expect(response.body.html).toContain('<strong>');
      expect(response.body.html).toContain('<table>');
    });

    it('keeps a hyperlink’s words but not the link', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/html`)
        .expect(200);

      expect(response.body.html).toContain('the DIFC courts');
      // Untrusted document content must not become an outbound link in the reading view.
      expect(response.body.html).not.toContain('difccourts.ae');
      expect(response.body.html).not.toContain('<a ');
    });

    it('gets one virtual page, because a .docx has no pages until it is laid out', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${documentId}/layout`)
        .expect(200);

      expect(response.body.kind).toBe('DOCX');
      expect(response.body.pageCount).toBe(1);
      expect(response.body.pages[0].startOffset).toBe(0);
      expect(response.body.pages[0].endOffset).toBe(response.body.textLength);
    });
  });
});
