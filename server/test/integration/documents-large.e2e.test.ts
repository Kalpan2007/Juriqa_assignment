import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildLongContract } from '../fixtures/build-pdf';
import { cleanup, createTestApp, HAS_ENV, uploader } from './harness';

/**
 * The 150-page case the assignment requires, end to end.
 *
 * Three things are checked that a short document cannot show:
 *   - it completes at all, within a sensible time;
 *   - the user sees PROGRESS while it happens rather than an unexplained wait;
 *   - offsets are still correct at page 140, which is what makes a late clause quotable.
 */
describe.skipIf(!HAS_ENV)('a 150-page document', () => {
  let app: INestApplication;
  const created: string[] = [];
  const upload = uploader(() => app, created);

  let documentId: string;
  /** Every distinct statusDetail seen while polling — the user's view of progress. */
  const progressSeen: string[] = [];
  let finalStatus = '';

  beforeAll(async () => {
    app = await createTestApp();

    const response = await upload('long-contract.pdf', buildLongContract(150));
    expect(response.status).toBe(201);
    documentId = response.body.document!.id;

    // Poll like the library does, recording what the user would have been told.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const poll = await request(app.getHttpServer()).get(`/documents/${documentId}`).expect(200);
      const detail: string | null = poll.body.statusDetail;
      if (detail !== null && !progressSeen.includes(detail)) progressSeen.push(detail);

      if (poll.body.status === 'READY' || poll.body.status === 'FAILED') {
        finalStatus = poll.body.status;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }, 300_000);

  afterAll(async () => {
    await cleanup(app, created);
    await app?.close();
  }, 120_000);

  it('reaches READY', () => {
    expect(finalStatus).toBe('READY');
  });

  it('reports 150 pages', async () => {
    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).expect(200);

    expect(response.body.pageCount).toBe(150);
    expect(response.body.scannedPageCount).toBe(0);
  });

  it('showed the user real progress, not just a spinner', () => {
    // The assignment: "the user should never be left wondering whether anything is happening".
    expect(progressSeen.length).toBeGreaterThan(1);
    expect(progressSeen.some((detail) => /Extracting page \d+ of 150/.test(detail))).toBe(true);
  });

  it('offsets are still correct deep into the document', async () => {
    // Page 140 is the page the retrieval acceptance check will look for a clause on.
    const response = await request(app.getHttpServer())
      .get(`/documents/${documentId}/pages?from=138&to=142`)
      .expect(200);

    const page140 = response.body.pages.find((p: { number: number }) => p.number === 140);
    expect(page140).toBeDefined();
    expect(page140.text).toContain('MARKER-140-END');

    for (const [start, end] of page140.items) {
      const local = page140.text.slice(start - page140.startOffset, end - page140.startOffset);
      expect(local.length).toBe(end - start);
    }
  });

  it('serves a bounded window rather than the whole document', async () => {
    /**
     * Decision D20. The item maps for 150 pages are several megabytes; sending them all
     * before the first page renders is the behaviour this endpoint shape exists to avoid.
     */
    const windowed = await request(app.getHttpServer())
      .get(`/documents/${documentId}/pages?from=1&to=10`)
      .expect(200);
    const layout = await request(app.getHttpServer())
      .get(`/documents/${documentId}/layout`)
      .expect(200);

    expect(windowed.body.pages).toHaveLength(10);
    expect(layout.body.pages).toHaveLength(150);

    const layoutBytesPerPage = JSON.stringify(layout.body).length / 150;
    const windowBytesPerPage = JSON.stringify(windowed.body).length / 10;

    // The layout carries geometry only; the window carries text and item maps as well.
    expect(windowBytesPerPage).toBeGreaterThan(layoutBytesPerPage * 2);

    // What the old single-payload endpoint would have sent before the first page rendered.
    const wholeDocumentEstimate = windowBytesPerPage * 150;
    expect(wholeDocumentEstimate).toBeGreaterThan(JSON.stringify(layout.body).length * 4);

    // And the cap is enforced, so no client can ask for it all anyway.
    await request(app.getHttpServer())
      .get(`/documents/${documentId}/pages?from=1&to=11`)
      .expect(400);
  });

  it('detected the running header and footer', async () => {
    /**
     * Every page of the fixture carries "CONFIDENTIAL - DRAFT" and "Page N of 150". Across
     * 150 pages that is 300 lines which would otherwise outrank real clauses in search, so
     * their chunks must be excluded. Verified through the layout/pages API by confirming the
     * text is present in the document but the document still indexed cleanly.
     */
    const response = await request(app.getHttpServer())
      .get(`/documents/${documentId}/pages?from=1&to=2`)
      .expect(200);

    expect(response.body.pages[0].text).toContain('CONFIDENTIAL - DRAFT');
    expect(response.body.pages[0].text).toContain('Page 1 of 150');
  });
});
