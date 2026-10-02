import { Injectable } from '@nestjs/common';
import { Prisma, type Document, type DocumentKind, type DocumentStatus } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { Chunk } from './domain/chunker';

/**
 * All Prisma access for Document, Page and Chunk — and the only place it is allowed
 * (CLAUDE.md server rules). Services never see a query.
 */

export interface CreateDocumentInput {
  name: string;
  kind: DocumentKind;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface SaveExtractionInput {
  documentId: string;
  fullText: string;
  html: string | null;
  pageCount: number;
  scannedPageCount: number;
  pages: Array<{
    number: number;
    startOffset: number;
    endOffset: number;
    width: number | null;
    height: number | null;
    textChars: number;
    isScanned: boolean;
    /** Compact [start, end, x, y, w, h, eol]; `str` is never stored (decision D20). */
    items: number[][] | null;
  }>;
  chunks: Chunk[];
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateDocumentInput): Promise<Document> {
    return this.prisma.document.create({ data: input });
  }

  async findById(id: string): Promise<Document | null> {
    return this.prisma.document.findUnique({ where: { id } });
  }

  async findAll(): Promise<Document[]> {
    return this.prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Earliest document with this hash, excluding `exceptId` — powers the duplicate hint. */
  async findBySha256(sha256: string, exceptId?: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { sha256, ...(exceptId ? { id: { not: exceptId } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.document.count({ where: { id } });
    return count > 0;
  }

  /** The key is derived from the id, so it can only be written after the row exists. */
  async setStorageKey(id: string, storageKey: string): Promise<Document> {
    return this.prisma.document.update({ where: { id }, data: { storageKey } });
  }

  async setStatus(id: string, status: DocumentStatus, statusDetail?: string | null): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { status, statusDetail: statusDetail ?? null },
    });
  }

  async markFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { status: 'FAILED', errorCode, errorMessage, statusDetail: null },
    });
  }

  /**
   * Writes the extraction result in ONE transaction.
   *
   * All or nothing matters here: a document whose text was saved but whose chunks were not
   * would look READY and answer every question with "not found". Pages and chunks are deleted
   * first so a retry after a partial failure cannot double-insert.
   */
  async saveExtraction(input: SaveExtractionInput): Promise<void> {
    const { documentId, fullText, html, pageCount, scannedPageCount, pages, chunks } = input;

    await this.prisma.$transaction(async (tx) => {
      await tx.page.deleteMany({ where: { documentId } });
      await tx.chunk.deleteMany({ where: { documentId } });

      await tx.document.update({
        where: { id: documentId },
        data: { fullText, html, pageCount, scannedPageCount },
      });

      if (pages.length > 0) {
        await tx.page.createMany({
          data: pages.map((page) => ({
            documentId,
            number: page.number,
            startOffset: page.startOffset,
            endOffset: page.endOffset,
            width: page.width,
            height: page.height,
            textChars: page.textChars,
            isScanned: page.isScanned,
            items: page.items === null ? Prisma.DbNull : page.items,
          })),
        });
      }

      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((chunk) => ({
            documentId,
            ordinal: chunk.ordinal,
            heading: chunk.heading,
            clauseRef: chunk.clauseRef,
            startOffset: chunk.start,
            endOffset: chunk.end,
            tokenCount: chunk.tokenCount,
            text: chunk.text,
            isBoilerplate: chunk.isBoilerplate,
          })),
        });
      }
    });
  }

  /** Page geometry only — small enough to fetch for a 300-page document (decision D20). */
  async findPageLayout(documentId: string): Promise<
    Array<{
      number: number;
      startOffset: number;
      endOffset: number;
      width: number | null;
      height: number | null;
      isScanned: boolean;
    }>
  > {
    return this.prisma.page.findMany({
      where: { documentId },
      orderBy: { number: 'asc' },
      select: {
        number: true,
        startOffset: true,
        endOffset: true,
        width: true,
        height: true,
        isScanned: true,
      },
    });
  }

  /** A bounded window of pages, with their item maps. */
  async findPageRange(
    documentId: string,
    from: number,
    to: number,
  ): Promise<
    Array<{
      number: number;
      startOffset: number;
      endOffset: number;
      width: number | null;
      height: number | null;
      isScanned: boolean;
      items: Prisma.JsonValue | null;
    }>
  > {
    return this.prisma.page.findMany({
      where: { documentId, number: { gte: from, lte: to } },
      orderBy: { number: 'asc' },
      select: {
        number: true,
        startOffset: true,
        endOffset: true,
        width: true,
        height: true,
        isScanned: true,
        items: true,
      },
    });
  }

  /** The 1-based numbers of pages with no readable text, for the warning banner. */
  async findScannedPageNumbers(documentId: string): Promise<number[]> {
    const pages = await this.prisma.page.findMany({
      where: { documentId, isScanned: true },
      orderBy: { number: 'asc' },
      select: { number: true },
    });
    return pages.map((page) => page.number);
  }

  /** Just the text, for extracting a slice without loading pages or chunks. */
  async findFullText(documentId: string): Promise<string | null> {
    const row = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { fullText: true },
    });
    return row?.fullText ?? null;
  }

  async findHtml(documentId: string): Promise<string | null> {
    const row = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { html: true },
    });
    return row?.html ?? null;
  }

  /** Cascades to Page, Chunk, ChatDocument and Quote (schema-level onDelete). */
  async delete(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }

  /**
   * Documents left mid-processing by a crash. pg-boss resumes its own active jobs, so this is
   * the safety net for a document whose job vanished entirely.
   */
  async findStuck(olderThanMs: number): Promise<Document[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.prisma.document.findMany({
      where: {
        status: { in: ['UPLOADED', 'EXTRACTING', 'INDEXING'] },
        updatedAt: { lt: cutoff },
      },
    });
  }
}
