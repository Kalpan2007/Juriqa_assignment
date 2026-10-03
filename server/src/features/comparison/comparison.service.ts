import { Injectable, Logger } from '@nestjs/common';
import type { ComparisonResultDto, CreateComparisonInput } from '@ca/shared';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { AppError } from '../../core/errors/app-error';
import { segmentClauses } from '../documents/domain/clause-segmenter';
import { alignClauses } from './domain/clause-aligner';
import { buildComparisonChanges } from './domain/comparison-builder';

const ALGORITHM_VERSION = 1;

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  async compare(input: CreateComparisonInput): Promise<ComparisonResultDto> {
    if (input.baseDocumentId === input.revisedDocumentId) {
      throw AppError.badRequest('COMPARISON_SAME_DOCUMENT', 'Choose two different documents.');
    }

    const [baseDoc, revisedDoc] = await Promise.all([
      this.documents.getReadyDocument(input.baseDocumentId),
      this.documents.getReadyDocument(input.revisedDocumentId),
    ]);

    // Cache check via baseSha256 + revisedSha256 + algorithmVersion (ARCHITECTURE section 10)
    const cached = await this.prisma.comparison.findUnique({
      where: {
        baseSha256_revisedSha256_algorithmVersion: {
          baseSha256: baseDoc.sha256,
          revisedSha256: revisedDoc.sha256,
          algorithmVersion: ALGORITHM_VERSION,
        },
      },
    });

    if (cached !== null && cached.status === 'DONE' && cached.result) {
      this.logger.log({ comparisonId: cached.id }, 'Returning cached comparison');
      // `id` and `createdAt` are never stored inside the result JSON blob — they live only on
      // the Prisma record. Inject them here so the response satisfies the shared schema.
      const cachedPayload = cached.result as unknown as Omit<ComparisonResultDto, 'id' | 'createdAt'>;
      return {
        ...cachedPayload,
        id: cached.id,
        createdAt: cached.createdAt.toISOString(),
      };
    }

    // Run clause segmentation
    const baseClauses = segmentClauses(baseDoc.fullText ?? '');
    const revisedClauses = segmentClauses(revisedDoc.fullText ?? '');

    // Align clauses using content-first sequence alignment
    const alignment = alignClauses(baseClauses, revisedClauses);
    const { changes, counts } = buildComparisonChanges(alignment.pairs);

    const differentContractsWarning = alignment.unmatchedRatio > 0.7;

    const resultPayload: Omit<ComparisonResultDto, 'id' | 'createdAt'> = {
      baseDocumentId: baseDoc.id,
      baseDocumentName: baseDoc.name,
      revisedDocumentId: revisedDoc.id,
      revisedDocumentName: revisedDoc.name,
      status: 'READY',
      counts,
      renumberNote: alignment.renumberNote,
      differentContractsWarning,
      changes,
    };

    // Upsert comparison record
    const saved = await this.prisma.comparison.upsert({
      where: {
        baseSha256_revisedSha256_algorithmVersion: {
          baseSha256: baseDoc.sha256,
          revisedSha256: revisedDoc.sha256,
          algorithmVersion: ALGORITHM_VERSION,
        },
      },
      update: {
        status: 'DONE',
        result: resultPayload as unknown as Prisma.InputJsonValue,
      },
      create: {
        baseDocumentId: baseDoc.id,
        revisedDocumentId: revisedDoc.id,
        baseSha256: baseDoc.sha256,
        revisedSha256: revisedDoc.sha256,
        algorithmVersion: ALGORITHM_VERSION,
        status: 'DONE',
        result: resultPayload as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ...resultPayload,
      id: saved.id,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async getComparison(id: string): Promise<ComparisonResultDto> {
    const record = await this.prisma.comparison.findUnique({
      where: { id },
      include: {
        base: { select: { name: true } },
        revised: { select: { name: true } },
      },
    });

    if (record === null) {
      throw AppError.notFound('NOT_FOUND', 'That comparison no longer exists.');
    }

    if (record.result) {
      const result = record.result as unknown as ComparisonResultDto;
      return {
        ...result,
        id: record.id,
        createdAt: record.createdAt.toISOString(),
      };
    }

    return {
      id: record.id,
      baseDocumentId: record.baseDocumentId,
      baseDocumentName: record.base.name,
      revisedDocumentId: record.revisedDocumentId,
      revisedDocumentName: record.revised.name,
      status: record.status === 'DONE' ? 'READY' : 'PENDING',
      counts: { high: 0, medium: 0, low: 0, total: 0 },
      changes: [],
      createdAt: record.createdAt.toISOString(),
    };
  }
}
