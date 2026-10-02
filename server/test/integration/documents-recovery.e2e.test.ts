import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StuckJobsRecovery } from '../../src/features/documents/processing/stuck-jobs.recovery';
import { buildPdf, textPage } from '../fixtures/build-pdf';
import { cleanup, createTestApp, HAS_ENV, uploader, waitForFinalStatus } from './harness';

/**
 * Recovery from a crash mid-processing (ARCHITECTURE section 4).
 *
 * The F1 acceptance check is "kill the server mid-processing, restart, and the document still
 * ends in a final state". Killing a process from inside its own test is not possible, so the
 * STATE a crash leaves behind is reproduced instead: a document stuck in EXTRACTING with an
 * old `updatedAt` and no live job. That is the condition recovery exists for, and it is the
 * one that would otherwise leave a document spinning forever in the UI.
 */
describe.skipIf(!HAS_ENV)('crash recovery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const created: string[] = [];
  const upload = uploader(() => app, created);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await cleanup(app, created);
    await app?.close();
  }, 60_000);

  it('re-enqueues a document left mid-processing and it reaches a final state', async () => {
    const response = await upload(
      'interrupted.pdf',
      buildPdf([
        textPage(['1. Confidentiality', 'Each party shall keep the information confidential.']),
        textPage(['2. Term', 'This Agreement runs for 12 months.']),
      ]),
    );
    const id = response.body.document!.id;

    // Let the first pass finish so the document is in a known good state.
    await waitForFinalStatus(app, id);

    /**
     * Now simulate what a `kill -9` during extraction leaves behind: status EXTRACTING, a
     * stale `updatedAt`, and no job. `updateMany` is used so Prisma's @updatedAt does not
     * overwrite the timestamp we are deliberately backdating.
     */
    await prisma.$executeRaw`
      UPDATE "Document"
      SET status = 'EXTRACTING',
          "statusDetail" = 'Extracting page 1 of 2',
          "updatedAt" = NOW() - INTERVAL '30 minutes'
      WHERE id = ${id}::uuid`;

    const stuck = await request(app.getHttpServer()).get(`/documents/${id}`).expect(200);
    expect(stuck.body.status).toBe('EXTRACTING');

    // Run recovery exactly as it runs on boot.
    await app.get(StuckJobsRecovery).onApplicationBootstrap();

    const final = await waitForFinalStatus(app, id, 120_000);

    // The guarantee: never left in a non-final state.
    expect(['READY', 'FAILED']).toContain(final.status);
    expect(final.status).toBe('READY');
    expect(final.statusDetail).toBeNull();
  }, 240_000);

  it('leaves a recently updated in-progress document alone', async () => {
    /**
     * The other half of the guarantee: recovery must not steal a document that another
     * instance is actively extracting right now, or two workers would process the same file.
     */
    const response = await upload(
      'in-progress.pdf',
      buildPdf([textPage(['1. Fees', 'Fees are payable within 30 days.'])]),
    );
    const id = response.body.document!.id;
    await waitForFinalStatus(app, id);

    // Fresh timestamp: this is what an actively-processing document looks like.
    await prisma.$executeRaw`
      UPDATE "Document" SET status = 'EXTRACTING', "updatedAt" = NOW() WHERE id = ${id}::uuid`;

    const before = await prisma.document.findUnique({ where: { id }, select: { updatedAt: true } });
    await app.get(StuckJobsRecovery).onApplicationBootstrap();

    const after = await request(app.getHttpServer()).get(`/documents/${id}`).expect(200);
    expect(after.body.status).toBe('EXTRACTING');
    expect(before).not.toBeNull();

    // Put it back so cleanup can delete it.
    await prisma.$executeRaw`
      UPDATE "Document" SET status = 'READY', "statusDetail" = NULL WHERE id = ${id}::uuid`;
  }, 180_000);

  it('a document deleted while queued does not fail the worker', async () => {
    // The worker must exit cleanly rather than retrying forever against a missing row.
    const response = await upload(
      'delete-while-queued.pdf',
      buildPdf([textPage(['1. Notices', 'Notices shall be in writing.'])]),
    );
    const id = response.body.document!.id;

    // Delete immediately, most likely before or during processing.
    await request(app.getHttpServer()).delete(`/documents/${id}`).expect(204);
    created.splice(created.indexOf(id), 1);

    // Give the worker a moment to pick up the now-orphaned job, then confirm the service is
    // still healthy — i.e. the job did not crash it or wedge the queue.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const health = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(health.body.status).toBe('ok');
    await request(app.getHttpServer()).get(`/documents/${id}`).expect(404);
  }, 120_000);
});
