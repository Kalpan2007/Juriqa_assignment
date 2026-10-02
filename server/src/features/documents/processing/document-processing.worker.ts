import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '../../../config/config.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { JOB_NAMES, type DocumentProcessJob } from '../../../infrastructure/queue/job-names';
import { DocumentsRepository } from '../documents.repository';
import { extractPdf, PdfExtractionError } from '../domain/pdf-extractor';
import { extractDocx, DocxExtractionError } from '../domain/docx-extractor';
import { detectScanned, formatPageRanges } from '../domain/scanned-detector';
import { detectBoilerplate, type PageLines } from '../domain/boilerplate-detector';
import { segmentClauses } from '../domain/clause-segmenter';
import { chunkSegments } from '../domain/chunker';

/**
 * Processes one uploaded document: extract → detect → chunk → index (ARCHITECTURE section 4).
 *
 * Runs as a pg-boss job rather than inside the upload request, for three reasons the
 * assignment cares about: a 150-page document takes minutes, the user must see progress while
 * it happens, and a server restart mid-way must not lose the work.
 *
 * Every exit path is final. A document must never be left sitting in EXTRACTING: either it
 * reaches READY, or it reaches FAILED with a code and a sentence explaining why.
 */
@Injectable()
export class DocumentProcessingWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentProcessingWorker.name);

  /** Report progress every few pages, not every page — each one is a database write. */
  private static readonly PROGRESS_EVERY = 5;

  constructor(
    private readonly repository: DocumentsRepository,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.work<DocumentProcessJob>(JOB_NAMES.documentProcess, (data) =>
      this.process(data.documentId),
    );
    this.logger.log('Document processing worker registered');
  }

  async process(documentId: string): Promise<void> {
    const document = await this.repository.findById(documentId);

    // Deleted while queued, or while a previous attempt was running. Exit cleanly — throwing
    // would retry forever against a row that no longer exists.
    if (document === null) {
      this.logger.log({ documentId }, 'Document gone before processing; skipping');
      return;
    }

    try {
      await this.repository.setStatus(documentId, 'EXTRACTING', 'Reading the document');
      const buffer = await this.storage.download(document.storageKey);

      const outcome =
        document.kind === 'PDF'
          ? await this.processPdf(documentId, buffer)
          : await this.processDocx(documentId, buffer);

      /**
       * Only mark READY when the document really is readable.
       *
       * This branch is the reason the extraction steps return an outcome instead of just
       * returning: they can finish having decided the document is UNUSABLE (a scan, or a
       * .docx with no readable text) and record FAILED themselves. Setting READY here
       * unconditionally would overwrite that verdict and present an empty document as a
       * success — the single behaviour the assignment names as the worst possible output.
       */
      if (outcome === 'indexed') {
        await this.repository.setStatus(documentId, 'READY', null);
        this.logger.log({ documentId }, 'Document ready');
      } else {
        this.logger.log({ documentId }, 'Document finished as unreadable; left FAILED');
      }
    } catch (error) {
      await this.fail(documentId, error);
    }
  }

  private async processPdf(documentId: string, buffer: Buffer): Promise<ProcessOutcome> {
    const extraction = await extractPdf(buffer, {
      maxPages: this.config.maxPages,
      onProgress: async (page, total) => {
        if (page % DocumentProcessingWorker.PROGRESS_EVERY !== 0 && page !== total) return;
        // Stop early if the document was deleted mid-extraction.
        if (!(await this.repository.exists(documentId))) {
          throw new DocumentDeletedDuringProcessing();
        }
        await this.repository.setStatus(
          documentId,
          'EXTRACTING',
          `Extracting page ${page} of ${total}`,
        );
      },
    });

    const scan = detectScanned(extraction.pages.map((page) => page.textChars));

    /**
     * The assignment's explicit requirement: a scanned PDF must be reported as unreadable,
     * never saved as an empty document and called a success. OCR is out of scope, and the
     * message says so rather than implying the file was bad.
     */
    if (scan.isFullyScanned) {
      await this.repository.markFailed(
        documentId,
        'SCANNED_PDF',
        'This PDF contains no readable text. It looks like a scan or a set of images, and reading scanned text (OCR) is not supported.',
      );
      return 'unreadable';
    }

    await this.repository.setStatus(documentId, 'INDEXING', 'Preparing for search');

    const scannedSet = new Set(scan.scannedPages);
    const boilerplate = detectBoilerplate(this.toPageLines(extraction));
    const segments = segmentClauses(extraction.fullText);
    const chunks = chunkSegments(extraction.fullText, segments, {
      boilerplateRanges: boilerplate.ranges,
    });

    await this.repository.saveExtraction({
      documentId,
      fullText: extraction.fullText,
      html: null,
      pageCount: extraction.pageCount,
      scannedPageCount: scan.scannedPages.length,
      pages: extraction.pages.map((page) => ({
        number: page.number,
        startOffset: page.startOffset,
        endOffset: page.endOffset,
        width: page.width,
        height: page.height,
        textChars: page.textChars,
        isScanned: scannedSet.has(page.number),
        items: page.items.map((item) => [
          item.start,
          item.end,
          round(item.x),
          round(item.y),
          round(item.width),
          round(item.height),
          item.hasEol ? 1 : 0,
        ]),
      })),
      chunks,
    });

    if (scan.scannedPages.length > 0) {
      this.logger.warn(
        { documentId, pages: formatPageRanges(scan.scannedPages) },
        'Document has pages with no readable text',
      );
    }

    return 'indexed';
  }

  private async processDocx(documentId: string, buffer: Buffer): Promise<ProcessOutcome> {
    const extraction = await extractDocx(buffer);

    // A .docx with no text is not a scan — it is empty or structured in a way mammoth cannot
    // read (a text box, a frame), so it gets its own honest message.
    if (extraction.fullText.trim().length === 0) {
      await this.repository.markFailed(
        documentId,
        'EXTRACTION_FAILED',
        'No readable text could be found in this document. Text inside text boxes, headers and footers is not supported.',
      );
      return 'unreadable';
    }

    await this.repository.setStatus(documentId, 'INDEXING', 'Preparing for search');

    const segments = segmentClauses(extraction.fullText);
    const chunks = chunkSegments(extraction.fullText, segments);

    await this.repository.saveExtraction({
      documentId,
      fullText: extraction.fullText,
      html: extraction.html,
      // A DOCX has no pages until it is laid out, so it gets one virtual page covering the
      // whole text. Coverage reports sections for DOCX rather than pages (decision D13).
      pageCount: 1,
      scannedPageCount: 0,
      pages: [
        {
          number: 1,
          startOffset: 0,
          endOffset: extraction.fullText.length,
          width: null,
          height: null,
          textChars: extraction.fullText.replace(/\s/g, '').length,
          isScanned: false,
          items: null,
        },
      ],
      chunks,
    });

    if (extraction.messages.length > 0) {
      this.logger.log({ documentId, messages: extraction.messages }, 'DOCX conversion notes');
    }

    return 'indexed';
  }

  /** Splits each page's text into lines with absolute offsets, for boilerplate detection. */
  private toPageLines(extraction: {
    fullText: string;
    pages: Array<{ startOffset: number; endOffset: number }>;
  }): PageLines[] {
    return extraction.pages.map((page) => {
      const text = extraction.fullText.slice(page.startOffset, page.endOffset);
      const lines: Array<{ text: string; start: number; end: number }> = [];
      let cursor = 0;

      for (const line of text.split('\n')) {
        const start = page.startOffset + cursor;
        lines.push({ text: line, start, end: start + line.length });
        cursor += line.length + 1;
      }
      return { lines };
    });
  }

  /**
   * Turns any failure into a FINAL state with a readable message.
   * A document left in EXTRACTING is the one outcome the assignment singles out as wrong.
   */
  private async fail(documentId: string, error: unknown): Promise<void> {
    if (error instanceof DocumentDeletedDuringProcessing) {
      this.logger.log({ documentId }, 'Document deleted during processing; stopping');
      return;
    }

    const { code, message } = this.classify(error);
    this.logger.error({ documentId, code, err: error }, 'Document processing failed');

    try {
      await this.repository.markFailed(documentId, code, message);
    } catch (updateError) {
      // The row may have been deleted in the meantime; nothing more to do.
      this.logger.warn({ documentId, err: updateError }, 'Could not record failure');
    }
  }

  private classify(error: unknown): { code: string; message: string } {
    if (error instanceof PdfExtractionError) {
      switch (error.failure.reason) {
        case 'ENCRYPTED_PDF':
          return {
            code: 'ENCRYPTED_PDF',
            message: 'This PDF is password-protected. Remove the password and upload it again.',
          };
        case 'TOO_MANY_PAGES':
          return {
            code: 'TOO_MANY_PAGES',
            message: `This document has ${error.failure.pageCount} pages, more than the ${this.config.maxPages}-page limit.`,
          };
        case 'CORRUPT_FILE':
          return {
            code: 'CORRUPT_FILE',
            message: 'This PDF could not be read. It appears to be damaged or incomplete.',
          };
      }
    }

    if (error instanceof DocxExtractionError) {
      return error.failure.reason === 'ENCRYPTED_DOCX'
        ? {
            code: 'ENCRYPTED_DOCX',
            message: 'This document is password-protected. Remove the protection and try again.',
          }
        : {
            code: 'CORRUPT_FILE',
            message: 'This document could not be read. It appears to be damaged or incomplete.',
          };
    }

    return {
      code: 'EXTRACTION_FAILED',
      message: 'This document could not be processed. Please try uploading it again.',
    };
  }
}

/**
 * How an extraction step finished.
 * `unreadable` means the step already recorded FAILED with its own reason, so the caller must
 * NOT mark the document READY.
 */
type ProcessOutcome = 'indexed' | 'unreadable';

/** Not an error condition — the user deleted the document, so the job simply stops. */
class DocumentDeletedDuringProcessing extends Error {}

/** Geometry is only ever used to draw a box; sub-pixel precision is noise in the payload. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
