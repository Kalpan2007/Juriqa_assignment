import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import JSZip from 'jszip';
import { cleanup, createTestApp, HAS_ENV, uploader } from './harness';

/**
 * Every unsupported input gets its OWN message (ARCHITECTURE section 4).
 *
 * The assignment is specific about this: rejecting a file with a generic error is not enough,
 * because the user cannot tell what to do next. A `.doc` needs "save it as .docx"; a scan
 * needs to know OCR is not supported; a password-protected file needs the password removed.
 * The error CODE is what the UI picks its copy from, so each test asserts the code.
 */
describe.skipIf(!HAS_ENV)('upload rejections', () => {
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

  it('rejects a PNG as an unsupported type', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const response = await upload('logo.png', png);

    expect(response.status).toBe(415);
    expect(response.body.error?.code).toBe('UNSUPPORTED_TYPE');
    expect(response.body.error?.message).toContain('PDF and DOCX');
  });

  it('rejects a .txt even though it is readable text', async () => {
    const response = await upload('notes.txt', Buffer.from('A contract, but in a txt file.'));

    expect(response.status).toBe(415);
    expect(response.body.error?.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects a legacy .doc with advice that only applies to it', async () => {
    const ole = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(40),
      Buffer.from('WordDocument', 'utf16le'),
    ]);
    const response = await upload('old-contract.doc', ole);

    expect(response.status).toBe(415);
    // Its own code, not the generic one — the client shows "save it as .docx" for this.
    expect(response.body.error?.code).toBe('LEGACY_DOC_FORMAT');
    expect(response.body.error?.message).toContain('.docx');
  });

  it('rejects a password-protected .docx differently from a legacy .doc', async () => {
    // Both are OLE2 containers; telling a .docx owner to "save as .docx" would be nonsense.
    const encrypted = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(40),
      Buffer.from('EncryptedPackage', 'utf16le'),
    ]);
    const response = await upload('locked.docx', encrypted);

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('ENCRYPTED_DOCX');
    expect(response.body.error?.message).toContain('password');
  });

  it('rejects a renamed executable, because the extension is never trusted', async () => {
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(128, 0x90)]);
    const response = await upload('contract.pdf', exe);

    expect(response.status).toBe(415);
    expect(response.body.error?.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects an .xlsx, which is also a ZIP', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('xl/workbook.xml', '<workbook/>');
    const xlsx = await zip.generateAsync({ type: 'nodebuffer' });

    const response = await upload('fees.xlsx', xlsx);

    expect(response.status).toBe(415);
    expect(response.body.error?.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects an empty file', async () => {
    const response = await upload('empty.pdf', Buffer.alloc(0));

    // Multer discards a zero-byte part, so this arrives as either EMPTY_FILE or "no file".
    // Either is a clear 4xx; what matters is that nothing is ever processed.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(['EMPTY_FILE', 'BAD_REQUEST']).toContain(response.body.error?.code);
  });

  it('rejects a request with no file at all', async () => {
    const response = await request(app.getHttpServer()).post('/documents');

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('BAD_REQUEST');
  });

  it('returns the shared error shape, with a request id for support', async () => {
    const response = await upload('x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(response.body).toHaveProperty('error.code');
    expect(response.body).toHaveProperty('error.message');
    expect(response.body.error?.requestId).toBeTruthy();
  });

  it('never leaks a stack trace or provider detail', async () => {
    const response = await upload('x.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('at ');
    expect(serialised).not.toContain('node_modules');
    expect(serialised).not.toContain('Prisma');
  });
});
