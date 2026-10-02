import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import path from 'node:path';
import dotenv from 'dotenv';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/core/filters/all-exceptions.filter';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Throttling, with the REAL guard in place (decision D9).
 *
 * Two things have to be true at once, and they pull in opposite directions:
 *   - the routes that spend money (upload, and later chat/comparison/redline) must be limited,
 *     because the deployed app is a public URL;
 *   - the routes the UI polls must NOT be, because the library asks for a document's status
 *     every 1.5 s while it processes — about 40 requests a minute. A single global limit would
 *     make the app rate-limit its own progress indicator, which is the bug this suite exists
 *     to prevent regressing.
 */
const HAS_ENV = Boolean(process.env.DATABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** The deliberate upload limit from DocumentsController. */
const UPLOAD_LIMIT_PER_MINUTE = 10;

describe.skipIf(!HAS_ENV)('throttling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  }, 60_000);

  it('limits uploads and returns the shared error shape when it does', async () => {
    // Rejected uploads still count — the limit protects the endpoint, not just the happy path.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const statuses: number[] = [];

    for (let i = 0; i < UPLOAD_LIMIT_PER_MINUTE + 4; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/documents')
        .attach('file', png, `probe-${i}.png`);
      statuses.push(response.status);

      if (response.status === 429) {
        expect(response.body.error.code).toBe('RATE_LIMITED');
        expect(response.body.error.requestId).toBeTruthy();
      }
    }

    expect(statuses).toContain(429);
    // The limit must not be so eager that it blocks the very first upload.
    expect(statuses[0]).not.toBe(429);
  }, 120_000);

  it('does NOT throttle document status polling', async () => {
    /**
     * The regression guard for decision D9. 60 requests in a row is more than the UI makes
     * while a 150-page document processes; every one must succeed. A non-existent id is used
     * on purpose — a 404 still passes through the guard, so this tests the limit and not the
     * database.
     */
    const id = '3f6b0c1e-9a2d-4c5e-8f7a-1b2c3d4e5f60';

    for (let i = 0; i < 60; i += 1) {
      const response = await request(app.getHttpServer()).get(`/documents/${id}`);
      expect(response.status, `request ${i + 1} was throttled`).toBe(404);
    }
  }, 120_000);

  it('does NOT throttle the document list', async () => {
    for (let i = 0; i < 60; i += 1) {
      await request(app.getHttpServer()).get('/documents').expect(200);
    }
  }, 120_000);

  it('never throttles the health checks Render polls', async () => {
    // A rate-limited readiness probe would take the service out of rotation by itself.
    for (let i = 0; i < 80; i += 1) {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    }
  }, 120_000);
});
