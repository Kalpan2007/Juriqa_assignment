import { Injectable, Logger } from '@nestjs/common';
import type { CoverageDto, RetrievalMode } from '@ca/shared';
import { AppConfigService } from '../../config/config.service';
import { DocumentsService } from '../documents/documents.service';
import { ChunkSearchRepository, type SearchedChunk } from './chunk-search.repository';
import {
  batchChunksByBudget,
  computeBudget,
  selectChunksByBudget,
  splitBudgetAcrossDocuments,
  MIN_EXCERPT_TOKENS,
} from './domain/budgeter';
import { buildCoverage, type CoveragePage } from './domain/coverage';
import {
  buildSearchQuery,
  classifyQuestion,
  truncateQuery,
  type Classification,
} from './domain/question-classifier';

/**
 * Chooses what the model gets to read, and records exactly what that was
 * (ARCHITECTURE section 6).
 *
 * The second half is as important as the first. Every answer carries a coverage object built
 * from facts — which sections were sent, whether any page was unreadable — and the UI shows
 * it. That is what keeps the app from answering as though it read a whole document when it
 * read thirty pages of it.
 */

export interface RetrievalRequest {
  documentId: string;
  question: string;
  previousQuestion?: string | null;
  /** Forces a mode; omitted means the classifier decides. */
  requestedMode?: RetrievalMode;
  systemPromptText: string;
  historyText: string;
  /** Overrides the even split in a multi-document chat. */
  excerptTokenLimit?: number;
}

export interface RetrievalResult {
  mode: RetrievalMode;
  /** Sections to put in the prompt, in document order. */
  chunks: SearchedChunk[];
  /** For a thorough read: the batches to map over, in document order. */
  batches: SearchedChunk[][];
  coverage: CoverageDto;
  classification: Classification;
  /** True when there was no room for any excerpt at all. */
  budgetExhausted: boolean;
}

/** Minimum sections per document in a multi-document chat (ARCHITECTURE section 9). */
export const MIN_CHUNKS_PER_DOCUMENT = 2;

/** How many candidates the ranked search considers before the budget trims them. */
const SEARCH_CANDIDATE_LIMIT = 40;

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly search: ChunkSearchRepository,
    // Page geometry and the document kind come from the documents feature through its
    // exported service, never from its repository (decision D14).
    private readonly documents: DocumentsService,
    private readonly config: AppConfigService,
  ) {}

  /** Decides the mode for a question without running a retrieval. */
  classify(question: string): Classification {
    return classifyQuestion(question);
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const classification = classifyQuestion(request.question);

    /**
     * The classifier only ever ESCALATES. An explicit request from the user wins, but when
     * the user has not chosen, a question that cannot be answered honestly from a partial
     * read goes thorough — erring toward reading too much rather than too little.
     */
    const mode: RetrievalMode =
      request.requestedMode ?? (classification.needsWholeDocument ? 'THOROUGH' : 'RETRIEVAL');

    const budget = computeBudget({
      maxInputTokens: this.config.llm.maxInputTokens,
      systemPromptText: request.systemPromptText,
      historyText: request.historyText,
      questionText: request.question,
    });

    const excerptTokens = request.excerptTokenLimit ?? budget.excerptTokens;
    const [layout, totalChunks] = await Promise.all([
      this.documents.getLayout(request.documentId),
      this.search.countSearchable(request.documentId),
    ]);
    const pages: CoveragePage[] = layout.pages.map((page) => ({
      number: page.number,
      startOffset: page.startOffset,
      endOffset: page.endOffset,
      isScanned: page.isScanned,
    }));
    const isPdf = layout.kind === 'PDF';

    if (mode === 'THOROUGH') {
      const all = await this.search.findAllForThorough(request.documentId);
      const batches = batchChunksByBudget(all, Math.max(excerptTokens, MIN_EXCERPT_TOKENS));

      return {
        mode,
        chunks: all,
        batches,
        // The thorough runner rebuilds coverage as it goes; this is the optimistic starting
        // point, replaced with the truth if the run stops early.
        coverage: buildCoverage({
          mode,
          readChunks: all,
          totalChunks,
          pages,
          isPdf,
        }),
        classification,
        budgetExhausted: budget.exhausted,
      };
    }

    const query = truncateQuery(buildSearchQuery(request.question, request.previousQuestion));
    const candidates = await this.search.search(request.documentId, query, SEARCH_CANDIDATE_LIMIT);
    const { selected } = selectChunksByBudget(candidates, excerptTokens);

    this.logger.debug(
      {
        documentId: request.documentId,
        candidates: candidates.length,
        selected: selected.length,
        excerptTokens,
      },
      'Retrieval complete',
    );

    return {
      mode,
      chunks: selected,
      batches: [],
      coverage: buildCoverage({ mode, readChunks: selected, totalChunks, pages, isPdf }),
      classification,
      budgetExhausted: budget.exhausted,
    };
  }

  /**
   * Retrieval across several documents (ARCHITECTURE section 9).
   *
   * The budget is split evenly with a guaranteed minimum per document, because an answer
   * that compares documents must have read something from each of them — otherwise it would
   * be comparing one contract against silence.
   */
  async retrieveMultiple(
    documentIds: readonly string[],
    request: Omit<RetrievalRequest, 'documentId'>,
  ): Promise<Map<string, RetrievalResult>> {
    const budget = computeBudget({
      maxInputTokens: this.config.llm.maxInputTokens,
      systemPromptText: request.systemPromptText,
      historyText: request.historyText,
      questionText: request.question,
    });

    const { perDocument } = splitBudgetAcrossDocuments(
      budget.excerptTokens,
      documentIds.length,
      MIN_EXCERPT_TOKENS,
    );

    const results = new Map<string, RetrievalResult>();

    for (const documentId of documentIds) {
      const result = await this.retrieve({
        ...request,
        documentId,
        // Never thorough across several documents (decision D12) — the per-document
        // "Search thoroughly" action exists for that.
        requestedMode: 'RETRIEVAL',
        excerptTokenLimit: perDocument,
      });

      // Guarantee a minimum presence even if the budget was tight, so no document is
      // represented by nothing at all.
      if (result.chunks.length < MIN_CHUNKS_PER_DOCUMENT) {
        const topUp = await this.search.findAllForThorough(documentId);
        const extra = topUp.slice(0, MIN_CHUNKS_PER_DOCUMENT);
        const merged = new Map(result.chunks.map((chunk) => [chunk.id, chunk]));
        for (const chunk of extra) if (!merged.has(chunk.id)) merged.set(chunk.id, chunk);
        result.chunks = [...merged.values()].sort((a, b) => a.ordinal - b.ordinal);
      }

      results.set(documentId, result);
    }

    return results;
  }

}
