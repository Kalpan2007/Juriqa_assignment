import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatDto,
  ChatSummaryDto,
  CoverageDto,
  MessageDto,
  QuoteDto,
  SendMessageInput,
  SseEvent,
} from '@ca/shared';
import { MAX_CHAT_DOCUMENTS } from '@ca/shared';
import { AppError } from '../../core/errors/app-error';
import type { SseWriter } from '../../core/sse/sse-writer';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { DocumentsService } from '../documents/documents.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { QuoteVerifierService } from '../verification/quote-verifier.service';
import { ChatRepository, type ChatWithRelations, type MessageWithQuotes, type PersistQuoteInput } from './chat.repository';
import { AnswerStreamParser } from './domain/answer-stream-parser';
import { deriveAnswerStatus } from './domain/answer-status';
import { buildHistoryText, previousUserQuestion, type HistoryTurn } from './domain/history-builder';
import { parseQuotePayload } from './domain/quote-payload';
import {
  buildAnswerSystemPrompt,
  buildAnswerUserPrompt,
  renderExcerpts,
} from './prompts/answer.prompt';

/**
 * Chat orchestration (ARCHITECTURE section 7).
 *
 * The order of operations is the product:
 *   1. persist the question, create the assistant message, send `meta` — so a reload mid-answer
 *      finds a real message rather than nothing;
 *   2. stream text to the browser as it arrives;
 *   3. only AFTER the stream ends, verify every quote against the document and send `quotes`.
 *
 * Step 3 is deliberately last. Nothing is ever presented as a quotation before our own code
 * has found it in that document.
 */

/** Output allowance for an answer. Generous because reasoning tokens are billed as output. */
const ANSWER_OUTPUT_TOKENS = 1_600;

/** A STREAMING message older than this was abandoned by a vanished browser. */
const STALE_STREAM_MS = 5 * 60 * 1_000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repository: ChatRepository,
    private readonly documents: DocumentsService,
    private readonly retrieval: RetrievalService,
    private readonly verifier: QuoteVerifierService,
    private readonly llm: LlmService,
  ) {}

  async createChat(documentIds: readonly string[]): Promise<ChatSummaryDto> {
    if (documentIds.length === 0) {
      throw AppError.badRequest('NO_DOCUMENTS_SELECTED', 'Choose at least one document.');
    }
    if (documentIds.length > MAX_CHAT_DOCUMENTS) {
      throw AppError.badRequest(
        'TOO_MANY_DOCUMENTS',
        `You can ask across at most ${MAX_CHAT_DOCUMENTS} documents at once.`,
      );
    }

    // Every document must be READY; asking about one still extracting would answer from nothing.
    for (const documentId of documentIds) {
      await this.documents.getReadyDocument(documentId);
    }

    const chat = await this.repository.createChat(documentIds);
    return this.toSummary(chat, 0);
  }

  async getChat(chatId: string): Promise<ChatDto> {
    const chat = await this.requireChat(chatId);
    const messages = await this.repository.findMessages(chatId);

    return {
      ...this.toSummary(chat, messages.length),
      messages: messages.map((message) => this.toMessageDto(message)),
    };
  }

  async listChatsForDocument(documentId: string): Promise<ChatSummaryDto[]> {
    const chats = await this.repository.findChatsForDocument(documentId);
    return chats.map((chat) => this.toSummary(chat, chat._count.messages));
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.requireChat(chatId);
    await this.repository.deleteChat(chatId);
  }

  /** Housekeeping on boot: no message may be left looking like it is still being written. */
  async failStaleStreamingMessages(): Promise<void> {
    const count = await this.repository.failStaleStreamingMessages(STALE_STREAM_MS);
    if (count > 0) this.logger.warn({ count }, 'Marked abandoned streaming messages as errored');
  }

  /**
   * Answers a question, streaming over SSE.
   *
   * `signal` aborts when the client disconnects — which is how Stop works. Everything
   * streamed so far is kept and persisted.
   */
  async sendMessage(
    chatId: string,
    input: SendMessageInput,
    writer: SseWriter<SseEvent>,
    signal: AbortSignal,
  ): Promise<void> {
    const chat = await this.requireChat(chatId);

    if (chat.documents.length !== 1) {
      // Multi-document chat arrives in slice F6; until then this path is single-document.
      throw AppError.badRequest(
        'BAD_REQUEST',
        'Asking across several documents is not available yet.',
      );
    }
    const chatDocument = chat.documents[0];
    if (chatDocument === undefined) {
      throw AppError.badRequest('NO_DOCUMENTS_SELECTED', 'This chat has no documents.');
    }

    const document = await this.documents.getReadyDocument(chatDocument.documentId);
    const fullText = document.fullText ?? '';

    const history = await this.loadHistory(chatId);
    const historyText = buildHistoryText(history);

    // Persist the question before anything can fail, so it is never lost.
    await this.repository.addUserMessage(chatId, input.content);
    await this.repository.setTitleIfEmpty(chatId, input.content);

    // The prompt is needed to size the budget, so it is built with an empty excerpt first.
    const promptShape = buildAnswerSystemPrompt({
      documentName: document.name,
      excerpts: '',
      question: input.content,
      historyText,
      mode: 'RETRIEVAL',
      coverageComplete: false,
      skippedPages: [],
    });

    const retrieved = await this.retrieval.retrieve({
      documentId: document.id,
      question: input.content,
      previousQuestion: previousUserQuestion(history),
      requestedMode: input.mode,
      systemPromptText: promptShape,
      historyText,
    });

    const assistant = await this.repository.addAssistantMessage(
      chatId,
      retrieved.mode,
      retrieved.coverage,
    );

    writer.send({
      type: 'meta',
      messageId: assistant.id,
      mode: retrieved.mode,
      coverage: retrieved.coverage,
    });

    if (retrieved.chunks.length === 0) {
      // Nothing matched. Said plainly, scoped to what was searched — never "the document
      // does not contain it", because only some of it was searched.
      await this.finishWithNoContext(assistant.id, retrieved.coverage, writer);
      return;
    }

    const parser = new AnswerStreamParser();
    let streamAborted = false;
    let streamError: unknown = null;

    try {
      const systemPrompt = buildAnswerSystemPrompt({
        documentName: document.name,
        excerpts: '',
        question: input.content,
        historyText,
        mode: retrieved.mode,
        coverageComplete: retrieved.coverage.complete,
        skippedPages: retrieved.coverage.skippedPages,
      });
      const userPrompt = buildAnswerUserPrompt({
        documentName: document.name,
        excerpts: renderExcerpts(retrieved.chunks),
        question: input.content,
        historyText,
        mode: retrieved.mode,
        coverageComplete: retrieved.coverage.complete,
        skippedPages: retrieved.coverage.skippedPages,
      });

      const result = await this.llm.stream({
        purpose: 'chat.answer',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: ANSWER_OUTPUT_TOKENS,
        signal,
        onDelta: (text) => {
          const step = parser.push(text);
          if (step.delta.length > 0) writer.send({ type: 'delta', text: step.delta });
        },
        onRetryNotice: (attempt, waitMs) => {
          writer.send({
            type: 'notice',
            code: 'LLM_RATE_LIMITED',
            message: `The AI service is busy. Retrying (attempt ${attempt}) in ${Math.ceil(waitMs / 1000)}s…`,
          });
        },
      });

      streamAborted = result.aborted;
    } catch (error) {
      streamError = error;
    }

    const final = parser.finish();
    if (final.delta.length > 0 && !streamAborted) {
      writer.send({ type: 'delta', text: final.delta });
    }

    if (streamError !== null) {
      await this.finishWithError(assistant.id, parser.currentAnswer, streamError, writer);
      return;
    }

    /**
     * Stop: keep the text, and mark it PARTIAL rather than UNSUPPORTED (decision D11).
     * Quotes come last, so a stopped answer has none — accusing it of being unverifiable
     * would be blaming the app for the user's own action.
     */
    if (streamAborted) {
      const content = final.answerText.length > 0 ? final.answerText : parser.currentAnswer;
      await this.repository.finishAssistantMessage({
        messageId: assistant.id,
        content,
        status: 'STOPPED',
        answerStatus: 'PARTIAL',
        coverage: retrieved.coverage,
        quotes: [],
      });
      await this.repository.touch(chatId);
      writer.send({ type: 'done', status: 'STOPPED', answerStatus: 'PARTIAL' });
      return;
    }

    // --- verification: only now is anything called a quote ----------------------
    const payload = parseQuotePayload(final.quotesText);
    if (payload.error !== null) {
      writer.send({ type: 'notice', code: 'LLM_INVALID_RESPONSE', message: payload.error });
    }

    const verified = this.verifyQuotes(document.id, document.name, fullText, payload.quotes);
    const answerStatus = deriveAnswerStatus({
      messageStatus: 'DONE',
      answerText: final.answerText,
      quotes: verified.dtos,
    });

    await this.repository.finishAssistantMessage({
      messageId: assistant.id,
      content: final.answerText,
      status: 'DONE',
      answerStatus,
      coverage: retrieved.coverage,
      quotes: verified.rows,
    });
    await this.repository.touch(chatId);

    writer.send({ type: 'quotes', quotes: verified.dtos, coverage: retrieved.coverage });
    writer.send({ type: 'done', status: 'DONE', answerStatus });

    this.logger.log(
      {
        chatId,
        documentId: document.id,
        mode: retrieved.mode,
        answerStatus,
        quotesOffered: payload.quotes.length,
        quotesVerified: verified.dtos.filter((quote) => quote.status === 'VERIFIED').length,
      },
      'Answer complete',
    );
  }

  /**
   * Verifies every quote the model produced against the document it was attributed to.
   *
   * An unverified quote is KEPT rather than hidden, with its status, so the UI can show it
   * struck through with an explanation. Silently dropping it would leave a citation marker
   * pointing at nothing and hide the fact that the model invented something.
   */
  private verifyQuotes(
    documentId: string,
    documentName: string,
    fullText: string,
    rawQuotes: ReadonlyArray<{ n: number; text: string }>,
  ): { dtos: QuoteDto[]; rows: PersistQuoteInput[] } {
    const results = this.verifier.verifyMany(
      documentId,
      fullText,
      rawQuotes.map((quote) => quote.text),
    );

    const dtos: QuoteDto[] = [];
    const rows: PersistQuoteInput[] = [];

    rawQuotes.forEach((quote, index) => {
      const result = results[index];
      if (result === undefined) return;

      const isVerified = result.status === 'VERIFIED';
      const matches = isVerified ? result.matches : [];
      const matchKind = isVerified ? result.matchKind : null;

      dtos.push({
        id: `${index}`,
        citation: quote.n,
        text: quote.text,
        status: result.status,
        documentId: isVerified ? documentId : null,
        documentName: isVerified ? documentName : null,
        matches,
        matchKind,
      });

      rows.push({
        citation: quote.n,
        text: quote.text,
        status: result.status,
        documentId: isVerified ? documentId : null,
        matchKind,
        matches,
      });
    });

    return { dtos, rows };
  }

  private async finishWithNoContext(
    messageId: string,
    coverage: CoverageDto,
    writer: SseWriter<SseEvent>,
  ): Promise<void> {
    const message = coverage.complete
      ? 'This document does not appear to contain anything relevant to that question.'
      : 'Nothing relevant to that question was found in the sections reviewed.';

    writer.send({ type: 'delta', text: message });
    await this.repository.finishAssistantMessage({
      messageId,
      content: message,
      status: 'DONE',
      answerStatus: 'NOT_FOUND',
      coverage,
      quotes: [],
    });
    writer.send({ type: 'quotes', quotes: [], coverage });
    writer.send({ type: 'done', status: 'DONE', answerStatus: 'NOT_FOUND' });
  }

  private async finishWithError(
    messageId: string,
    partialContent: string,
    error: unknown,
    writer: SseWriter<SseEvent>,
  ): Promise<void> {
    const appError = AppError.isAppError(error)
      ? error
      : new AppError('INTERNAL', 500, 'Something went wrong while answering.');

    // Keep whatever was streamed: partial text is more use to the reader than nothing.
    await this.repository.finishAssistantMessage({
      messageId,
      content: partialContent,
      status: 'ERROR',
      answerStatus: null,
      coverage: null,
      errorCode: appError.code,
      quotes: [],
    });

    writer.send({ type: 'error', code: appError.code, message: appError.userMessage });
    writer.send({ type: 'done', status: 'ERROR', answerStatus: null });
  }

  private async loadHistory(chatId: string): Promise<HistoryTurn[]> {
    const messages = await this.repository.findMessages(chatId);
    return messages
      // An errored or empty turn adds nothing but noise to the context.
      .filter((message) => message.status !== 'ERROR' && message.content.trim().length > 0)
      .map((message) => ({ role: message.role, content: message.content }));
  }

  private async requireChat(chatId: string): Promise<ChatWithRelations> {
    const chat = await this.repository.findChat(chatId);
    if (chat === null) {
      throw AppError.notFound('CHAT_NOT_FOUND', 'That chat no longer exists.');
    }
    return chat;
  }

  private toSummary(chat: ChatWithRelations, messageCount: number): ChatSummaryDto {
    return {
      id: chat.id,
      title: chat.title,
      documents: chat.documents.map((link) => ({
        documentId: link.documentId,
        name: link.document?.name ?? 'Deleted document',
        alias: link.alias,
        // A deleted document leaves the chat readable, with its quotes unclickable.
        available: link.document !== null && link.document.status === 'READY',
      })),
      messageCount,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    };
  }

  private toMessageDto(message: MessageWithQuotes): MessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      answerStatus: message.answerStatus,
      mode: message.mode,
      coverage: (message.coverage as CoverageDto | null) ?? null,
      documentCoverage: [],
      errorCode: message.errorCode,
      quotes: message.quotes.map((quote) => ({
        id: quote.id,
        citation: quote.citation,
        text: quote.text,
        status: quote.status,
        documentId: quote.documentId,
        documentName: quote.document?.name ?? null,
        matches: Array.isArray(quote.matches)
          ? (quote.matches as Array<{ start: number; end: number }>)
          : [],
        matchKind: quote.matchKind,
      })),
      createdAt: message.createdAt.toISOString(),
    };
  }
}
