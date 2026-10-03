import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  type CreateRedlinePlanInput,
  type RedlinePlanResponseDto,
  type ApplyRedlineInput,
  type ApplyRedlineResponseDto,
  type RedlineEditDto,
} from '@ca/shared';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { AppError } from '../../core/errors/app-error';
import { loadDocx, saveDocx } from './domain/docx-package';
import { buildParagraphModels } from './domain/paragraph-model';
import { locateEdits, type LocatedEdit } from './domain/edit-locator';
import { applyRevisions, type EditApplication } from './domain/revision-writer';
import { validateRedline } from './domain/simulators';
import { EditPlanner } from './domain/edit-planner';

@Injectable()
export class RedlineService {
  private readonly logger = new Logger(RedlineService.name);
  private readonly planner: EditPlanner;

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    llm: LlmService,
  ) {
    this.planner = new EditPlanner(llm);
  }

  async createPlan(documentId: string, input: CreateRedlinePlanInput): Promise<RedlinePlanResponseDto> {
    const doc = await this.documents.getReadyDocument(documentId);

    if (doc.kind !== 'DOCX') {
      throw AppError.badRequest(
        'REDLINE_REQUIRES_DOCX',
        'Tracked changes need the original .docx. This document is a PDF.',
      );
    }

    const docxBuffer = await this.storage.download(doc.storageKey);
    const { docXml } = await loadDocx(docxBuffer);
    const paragraphs = buildParagraphModels(docXml);

    const plan = await this.planner.planEdits(input.instruction, doc.fullText ?? '');

    let locatedEdits: LocatedEdit[] = [];

    if (plan.outOfScopeReason) {
      locatedEdits = [
        {
          dto: {
            id: 'edit-1',
            find: input.instruction,
            replace: '',
            reason: 'Out of scope request',
            status: 'REJECTED',
            rejectionReason: plan.outOfScopeReason,
          },
        },
      ];
    } else if (plan.edits.length === 0) {
      locatedEdits = [
        {
          dto: {
            id: 'edit-1',
            find: input.instruction,
            replace: '',
            reason: 'No edits could be identified',
            status: 'REJECTED',
            rejectionReason: 'NOT_FOUND: The AI proposed text that is not in the document.',
          },
        },
      ];
    } else {
      const rawWithIds = plan.edits.map((e, idx) => ({
        id: `edit-${idx + 1}`,
        find: e.find,
        replace: e.replace,
        reason: e.reason,
        clauseRef: e.clauseRef,
      }));
      locatedEdits = locateEdits(rawWithIds, paragraphs);
    }

    const editDtos = locatedEdits.map((l) => l.dto);

    const record = await this.prisma.redline.create({
      data: {
        documentId: doc.id,
        instruction: input.instruction,
        status: 'PENDING',
        edits: editDtos as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      redlineId: record.id,
      documentId: doc.id,
      instruction: record.instruction,
      edits: editDtos,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async apply(redlineId: string, input: ApplyRedlineInput): Promise<ApplyRedlineResponseDto> {
    const record = await this.prisma.redline.findUnique({
      where: { id: redlineId },
      include: { document: true },
    });

    if (!record) {
      throw AppError.notFound('NOT_FOUND', 'That redline proposal no longer exists.');
    }

    const storedEdits = (record.edits ?? []) as unknown as RedlineEditDto[];
    const acceptedSet = new Set(input.acceptedEditIds);

    const toApply = storedEdits.filter((e) => acceptedSet.has(e.id) && e.status === 'APPLICABLE');

    if (toApply.length === 0) {
      throw AppError.badRequest(
        'REDLINE_NO_APPLICABLE_EDITS',
        'None of the proposed edits could be applied safely.',
      );
    }

    // Download original DOCX
    const originalBuffer = await this.storage.download(record.document.storageKey);

    const { zip, docXml } = await loadDocx(originalBuffer);
    const { docXml: originalDocXml } = await loadDocx(originalBuffer);

    const paragraphs = buildParagraphModels(docXml);
    const rawToApply = toApply.map((e) => ({
      id: e.id,
      find: e.find,
      replace: e.replace,
      reason: e.reason,
      clauseRef: e.clauseRef ?? undefined,
    }));
    const located = locateEdits(rawToApply, paragraphs);

    const applications: EditApplication[] = [];
    for (const item of located) {
      if (item.match && item.dto.status === 'APPLICABLE') {
        applications.push({
          id: item.dto.id,
          find: item.dto.find,
          replace: item.dto.replace,
          paragraphIndex: item.match.paragraphIndex,
          start: item.match.start,
          end: item.match.end,
        });
      }
    }

    if (applications.length === 0) {
      throw AppError.badRequest(
        'REDLINE_NO_APPLICABLE_EDITS',
        'None of the proposed edits could be applied safely.',
      );
    }

    // Apply revisions
    const expectedAcceptedTexts = applyRevisions(docXml, applications, 'Contract Analyzer');

    // Run simulators self-check
    validateRedline(originalDocXml, docXml, expectedAcceptedTexts);

    // Save repacked docx
    const outBuffer = await saveDocx(zip, docXml);

    const outputKey = StorageService.redlineKey(record.documentId, record.id);
    await this.storage.upload(
      outputKey,
      outBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    await this.prisma.redline.update({
      where: { id: redlineId },
      data: {
        status: 'DONE',
        outputKey,
      },
    });

    return {
      redlineId: record.id,
      appliedCount: applications.length,
      downloadUrl: `/redlines/${record.id}/download`,
    };
  }

  async getDownload(redlineId: string): Promise<{ buffer: Buffer; filename: string }> {
    const record = await this.prisma.redline.findUnique({
      where: { id: redlineId },
      include: { document: true },
    });

    if (!record || !record.outputKey) {
      throw AppError.notFound('NOT_FOUND', 'That redlined document is not ready or does not exist.');
    }

    const buffer = await this.storage.download(record.outputKey);
    const baseName = record.document.name.replace(/\.docx$/i, '');
    const filename = `${baseName}-redline.docx`;

    return { buffer, filename };
  }
}
