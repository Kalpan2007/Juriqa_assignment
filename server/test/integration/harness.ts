import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import path from 'node:path';
import dotenv from 'dotenv';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/core/filters/all-exceptions.filter';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

export const HAS_ENV = Boolean(
  process.env.DATABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Each test file builds its own application.
 *
 * That is deliberate: the throttler's storage lives in the app instance, so a fresh app means
 * a fresh upload budget. Every suite therefore stays under the real 10/min limit without
 * disabling the guard — the tests run against the same guard production does.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export interface UploadResult {
  status: number;
  body: {
    document?: { id: string; status: string };
    duplicateOfName?: string | null;
    error?: { code: string; message: string; requestId?: string };
  };
}

/** Uploads a file and records its id so the suite can clean up afterwards. */
export function uploader(app: () => INestApplication, created: string[]) {
  return async function upload(filename: string, buffer: Buffer): Promise<UploadResult> {
    const response = await request(app().getHttpServer())
      .post('/documents')
      .attach('file', buffer, filename);
    const id = response.body?.document?.id;
    if (typeof id === 'string') created.push(id);
    return { status: response.status, body: response.body };
  };
}

export interface FinalStatus {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  pageCount: number | null;
  scannedPageCount: number;
  statusDetail: string | null;
}

/** Polls a document until it reaches a final status, exactly as the library UI does. */
export async function waitForFinalStatus(
  app: INestApplication,
  id: string,
  timeoutMs = 90_000,
): Promise<FinalStatus> {
  const deadline = Date.now() + timeoutMs;
  let last = '(never fetched)';

  while (Date.now() < deadline) {
    const response = await request(app.getHttpServer()).get(`/documents/${id}`);
    if (response.status !== 200) {
      throw new Error(`Status poll for ${id} returned ${response.status}`);
    }
    last = response.body.status;
    if (last === 'READY' || last === 'FAILED') return response.body as FinalStatus;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Document ${id} never reached a final status (last seen: ${last})`);
}

/** Deletes everything a suite created, ignoring anything already gone. */
export async function cleanup(app: INestApplication | undefined, ids: string[]): Promise<void> {
  if (app === undefined) return;
  for (const id of ids) {
    await request(app.getHttpServer())
      .delete(`/documents/${id}`)
      .catch(() => undefined);
  }
}
