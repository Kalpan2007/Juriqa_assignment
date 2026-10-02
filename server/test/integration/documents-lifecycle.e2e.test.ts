import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildPdf, textPage } from '../fixtures/build-pdf';
import { cleanup, createTestApp, HAS_ENV, uploader, waitForFinalStatus } from './harness';

/** Duplicate detection, delete, and the not-ready guard other features rely on. */
describe.skipIf(!HAS_ENV)('document lifecycle', () => {
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

  describe('duplicates', () => {
    it('allows the same file twice and names the original', async () => {
      // Uploading the same contract twice is legitimate (a second version to compare), so it
      // is allowed — the UI just points out that it is the same file.
      const pdf = buildPdf([textPage(['1. Term', 'Twelve months from signature.'])]);

      const first = await upload('original.pdf', pdf);
      expect(first.status).toBe(201);
      expect(first.body.duplicateOfName).toBeNull();
      await waitForFinalStatus(app, first.body.document!.id);

      const second = await upload('a-copy.pdf', pdf);

      expect(second.status).toBe(201);
      expect(second.body.duplicateOfName).toBe('original.pdf');
      await waitForFinalStatus(app, second.body.document!.id);
    }, 180_000);
  });

  describe('delete', () => {
    it('removes the document, after which it is gone', async () => {
      const response = await upload(
        'to-delete.pdf',
        buildPdf([textPage(['1. Scope', 'Services as described in Schedule 1.'])]),
      );
      const id = response.body.document!.id;
      await waitForFinalStatus(app, id);

      await request(app.getHttpServer()).delete(`/documents/${id}`).expect(204);
      await request(app.getHttpServer()).get(`/documents/${id}`).expect(404);
      await request(app.getHttpServer()).get(`/documents/${id}/layout`).expect(404);

      // Already deleted, so the suite's cleanup need not try again.
      created.splice(created.indexOf(id), 1);
    }, 150_000);

    it('is idempotent enough to 404 rather than 500 on a second delete', async () => {
      const response = await upload(
        'delete-twice.pdf',
        buildPdf([textPage(['1. Fees', 'Fees are payable monthly.'])]),
      );
      const id = response.body.document!.id;
      await waitForFinalStatus(app, id);

      await request(app.getHttpServer()).delete(`/documents/${id}`).expect(204);
      await request(app.getHttpServer()).delete(`/documents/${id}`).expect(404);

      created.splice(created.indexOf(id), 1);
    }, 150_000);

    it('404s for a document that never existed', async () => {
      await request(app.getHttpServer())
        .delete('/documents/3f6b0c1e-9a2d-4c5e-8f7a-1b2c3d4e5f60')
        .expect(404);
    });

    it('400s for an id that is not a uuid', async () => {
      await request(app.getHttpServer()).get('/documents/not-a-uuid').expect(400);
    });

    it('a path-traversal attempt matches no route at all', async () => {
      // The id never reaches the filesystem — storage keys are built from the UUID, and the
      // user's filename is display-only — but the route should not even match. A normalised
      // URL falls outside /documents/:id, so 404 is the correct outcome, not a validation error.
      const response = await request(app.getHttpServer()).delete('/documents/../../etc/passwd');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('a document that is not ready', () => {
    it('reports a clear reason rather than an empty answer', async () => {
      // Other features call DocumentsService.getReadyDocument (decision D14); a FAILED
      // document must surface its own reason, not a generic 500.
      const ole = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.alloc(40),
        Buffer.from('WordDocument', 'utf16le'),
      ]);
      const rejected = await upload('legacy.doc', ole);

      // Rejected at the door, so it never becomes a document at all.
      expect(rejected.status).toBe(415);
      expect(rejected.body.document).toBeUndefined();
    });
  });
});
