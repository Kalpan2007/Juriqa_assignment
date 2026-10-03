import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DocumentDto,
  DocumentLayoutDto,
  DocumentHtmlDto,
  PagesResponseDto,
  UploadResponseDto,
} from '@ca/shared';
import { isErrorCode, MAX_PAGES_PER_REQUEST } from '@ca/shared';
import type { Document } from '../../../generated/prisma';
import { AppConfigService } from '../../config/config.service';
import { AppError } from '../../core/errors/app-error';
import { sha256 } from '../../core/utils/hash';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { JOB_NAMES, type DocumentProcessJob } from '../../infrastructure/queue/job-names';
import { DocumentsRepository } from './documents.repository';
import { contentTypeFor, extensionFor, sniffFile, type SniffRejection } from './domain/file-sniffer';
import { formatPageRanges } from './domain/scanned-detector';

/**
 * Upload, read models and delete (ARCHITECTURE section 4).
 *
 * The processing itself lives in the worker — upload returns as soon as the file is safely in
 * storage, so a 150-page document never holds an HTTP request open.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly repository: DocumentsRepository,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly config: AppConfigService,
  ) { }

  async upload(file: { originalname: string; buffer: Buffer; size: number }): Promise<UploadResponseDto> {
    // Size is checked before anything else: no point hashing 400 MB to then reject it.
    if (file.size > this.config.maxUploadBytes) {
      throw AppError.tooLarge(
        `That file is larger than the ${this.config.maxUploadMb} MB limit.`,
      );
    }

    const verdict = sniffFile(file.buffer);
    if (verdict.kind === 'rejected') {
      throw this.rejectionToError(verdict.reason);
    }

    const hash = sha256(file.buffer);
    const duplicate = await this.repository.findBySha256(hash);

    // Created first so the storage key can use its id — the user's filename never appears in
    // a path (ARCHITECTURE section 3.3).
    const extension = extensionFor(verdict.kind);
    const document = await this.repository.create({
      name: this.safeName(file.originalname),
      kind: verdict.kind,
      sizeBytes: file.size,
      sha256: hash,
      storageKey: 'pending',
    });

    const storageKey = StorageService.originalKey(document.id, extension);

    try {
      await this.storage.upload(storageKey, file.buffer, contentTypeFor(verdict.kind));
    } catch (error) {
      // Do not leave a row pointing at a file that was never written.
      await this.repository.delete(document.id).catch(() => undefined);
      throw error;
    }

    const saved = await this.repository.setStorageKey(document.id, storageKey);

    await this.queue.send<DocumentProcessJob>(
      JOB_NAMES.documentProcess,
      { documentId: document.id },
      // One processing job per document, however many times the upload is retried.
      { singletonKey: document.id },
    );

    this.logger.log({ documentId: document.id, kind: verdict.kind }, 'Document queued');

    return {
      document: this.toDto(saved),
      duplicateOfName: duplicate?.name ?? null,
    };
  }

  async list(): Promise<DocumentDto[]> {
    const documents = await this.repository.findAll();
    return documents.map((document) => this.toDto(document));
  }

  async getById(id: string): Promise<DocumentDto> {
    return this.toDto(await this.requireDocument(id));
  }

  /**
   * A READY document, or a clear reason why not.
   * Other features call THIS rather than the repository (decision D14).
   */
  async getReadyDocument(id: string): Promise<Document> {
    const document = await this.requireDocument(id);

    if (document.status === 'FAILED') {
      // errorCode is a plain string in the database; only a KNOWN code may reach the client,
      // or the UI would fall through to a generic message for a failure we can explain.
      throw new AppError(
        isErrorCode(document.errorCode) ? document.errorCode : 'EXTRACTION_FAILED',
        409,
        document.errorMessage ?? 'This document could not be read.',
      );
    }
    if (document.status !== 'READY') {
      throw new AppError(
        'DOCUMENT_NOT_READY',
        409,
        'This document is still being prepared. Wait until it is ready and try again.',
      );
    }
    return document;
  }

  /** Pages with no readable text, as a sentence — or null when there are none. */
  async getScannedPagesWarning(id: string): Promise<string | null> {
    const pages = await this.repository.findScannedPageNumbers(id);
    if (pages.length === 0) return null;
    const ranges = formatPageRanges(pages);
    const plural = pages.length === 1 ? 'Page' : 'Pages';
    const verb = pages.length === 1 ? 'contains' : 'contain';
    return `${plural} ${ranges} ${verb} no readable text and were not analysed.`;
  }

  async getLayout(id: string): Promise<DocumentLayoutDto> {
    const document = await this.requireDocument(id);
    const pages = await this.repository.findPageLayout(id);

    return {
      documentId: document.id,
      kind: document.kind,
      pageCount: document.pageCount ?? pages.length,
      textLength: document.fullText?.length ?? 0,
      pages: pages.map((page) => ({
        number: page.number,
        startOffset: page.startOffset,
        endOffset: page.endOffset,
        width: page.width,
        height: page.height,
        isScanned: page.isScanned,
      })),
    };
  }

  /**
   * A bounded window of pages with their text and item maps.
   *
   * Bounded on purpose (decision D20): a 150-page document's item maps are several MB, and
   * sending them all before the first page renders is why the viewer fetches visible ± 2.
   */
  async getPages(id: string, from: number, to: number): Promise<PagesResponseDto> {
    if (to - from + 1 > MAX_PAGES_PER_REQUEST) {
      throw AppError.badRequest(
        'BAD_REQUEST',
        `Request at most ${MAX_PAGES_PER_REQUEST} pages at a time.`,
      );
    }

    const document = await this.requireDocument(id);
    const fullText = document.fullText ?? '';
    const pages = await this.repository.findPageRange(id, from, to);

    return {
      documentId: id,
      pages: pages.map((page) => ({
        number: page.number,
        startOffset: page.startOffset,
        endOffset: page.endOffset,
        width: page.width,
        height: page.height,
        isScanned: page.isScanned,
        text: fullText.slice(page.startOffset, page.endOffset),
        items: this.toCompactItems(page.items),
      })),
    };
  }

  async getHtml(id: string): Promise<DocumentHtmlDto> {
    const document = await this.requireDocument(id);

    if (document.kind !== 'DOCX') {
      throw AppError.badRequest('BAD_REQUEST', 'Only DOCX documents have a reading view.');
    }
    if (document.html === null) {
      throw new AppError('DOCUMENT_NOT_READY', 409, 'This document is still being prepared.');
    }

    return {
      documentId: id,
      html: document.html,
      textLength: document.fullText?.length ?? 0,
    };
  }

  async getFileStream(id: string): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const document = await this.requireDocument(id);
    const buffer = await this.storage.download(document.storageKey);
    return {
      buffer,
      filename: document.name,
      contentType: contentTypeFor(document.kind),
    };
  }

  /**
   * Deletes the row and the stored file.
   *
   * The row goes first: if storage deletion fails, an orphaned object costs a little space,
   * whereas a row whose file is gone would be a document that looks fine and cannot be opened.
   */
  async delete(id: string): Promise<void> {
    const document = await this.requireDocument(id);
    await this.repository.delete(id);
    await this.storage.remove(document.storageKey);
    this.logger.log({ documentId: id }, 'Document deleted');
  }

  private async requireDocument(id: string): Promise<Document> {
    const document = await this.repository.findById(id);
    if (document === null) {
      throw AppError.notFound('NOT_FOUND', 'That document does not exist.');
    }
    return document;
  }

  private toCompactItems(items: unknown): Array<[number, number, number, number, number, number, number]> {
    if (!Array.isArray(items)) return [];
    return items.filter(
      (item): item is [number, number, number, number, number, number, number] =>
        Array.isArray(item) && item.length === 7 && item.every((value) => typeof value === 'number'),
    );
  }

  private rejectionToError(reason: SniffRejection): AppError {
    switch (reason) {
      case 'EMPTY_FILE':
        return AppError.badRequest('EMPTY_FILE', 'That file is empty.');
      case 'LEGACY_DOC_FORMAT':
        // Its OWN code, not the generic UNSUPPORTED_TYPE: the client picks its copy by code,
        // and "save it as .docx" is the only actionable advice for this case.
        return new AppError(
          'LEGACY_DOC_FORMAT',
          415,
          'Old .doc format is not supported. Save the file as .docx and try again.',
        );
      case 'ENCRYPTED_DOCX':
        return AppError.badRequest(
          'ENCRYPTED_DOCX',
          'This document is password-protected. Remove the protection and try again.',
        );
      case 'UNSUPPORTED_TYPE':
        return AppError.unsupportedType('Only PDF and DOCX files are supported.');
    }
  }

  /** The filename is display-only; strip anything that looks like a path. */
  private safeName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? 'document';
    return base.slice(0, 255);
  }

  private toDto(document: Document): DocumentDto {
    return {
      id: document.id,
      name: document.name,
      kind: document.kind,
      sizeBytes: document.sizeBytes,
      status: document.status,
      statusDetail: document.statusDetail,
      errorCode: document.errorCode,
      errorMessage: document.errorMessage,
      pageCount: document.pageCount,
      scannedPageCount: document.scannedPageCount,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  async seedSamples(): Promise<{ seeded: DocumentDto[]; count: number }> {
    const candidateDirs = [
      path.resolve(process.cwd(), 'TEST_FILES'),
      path.resolve(process.cwd(), '../TEST_FILES'),
      path.resolve(__dirname, '../../../../TEST_FILES'),
      path.resolve(__dirname, '../../fixtures'),
    ];
    const testDir = candidateDirs.find((d) => fs.existsSync(d));
    if (!testDir) {
      throw AppError.notFound('NOT_FOUND', 'Could not locate sample contracts directory.');
    }

    const sampleFilenames = [
      '01-facility-agreement-162p.pdf',
      '10-msa-v1.docx',
      '11-msa-v2.docx',
      '20-nda-mutual.pdf',
      '30-scanned-full.pdf',
    ];

    const seeded: DocumentDto[] = [];

    for (const filename of sampleFilenames) {
      const filePath = path.join(testDir, filename);
      if (!fs.existsSync(filePath)) continue;

      const buffer = fs.readFileSync(filePath);
      const hash = sha256(buffer);
      const existing = await this.repository.findBySha256(hash);
      if (existing) {
        seeded.push(this.toDto(existing));
        continue;
      }

      try {
        const res = await this.upload({
          originalname: filename,
          buffer,
          size: buffer.length,
        });
        seeded.push(res.document);
      } catch (err) {
        this.logger.warn({ filename, err }, 'Failed to seed sample contract');
      }
    }

    return { seeded, count: seeded.length };
  }
}
