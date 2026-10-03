import { Injectable } from '@nestjs/common';
import type {
  AnswerStatus,
  CoverageDto,
  DocumentCoverageDto,
  MatchKind,
  MessageStatus,
  QuoteStatus,
  RetrievalMode,
} from '@ca/shared';
import { Prisma, type Chat, type Message } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export type MessageCoverageInput = CoverageDto | { documentCoverage: DocumentCoverageDto[] } | null;

/** All Prisma access for Chat, ChatDocument, Message and Quote. */

export interface ChatWithRelations extends Chat {
  documents: Array<{
    documentId: string;
    alias: string;
    document: { id: string; name: string; status: string } | null;
  }>;
}

export interface MessageWithQuotes extends Message {
  quotes: Array<{
    id: string;
    citation: number;
    text: string;
    status: QuoteStatus;
    documentId: string | null;
    matchKind: MatchKind | null;
    matches: Prisma.JsonValue | null;
    document: { name: string } | null;
  }>;
}

export interface PersistQuoteInput {
  citation: number;
  text: string;
  status: QuoteStatus;
  documentId: string | null;
  matchKind: MatchKind | null;
  matches: Array<{ start: number; end: number }>;
}

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createChat(documentIds: readonly string[]): Promise<ChatWithRelations> {
    return this.prisma.chat.create({
      data: {
        documents: {
          // Aliases are assigned by position and never change, because the prompt and the
          // verifier both resolve quotes through them.
          create: documentIds.map((documentId, index) => ({
            documentId,
            alias: `D${index + 1}`,
          })),
        },
      },
      include: { documents: { include: { document: { select: { id: true, name: true, status: true } } } } },
    });
  }

  async findChat(chatId: string): Promise<ChatWithRelations | null> {
    return this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        documents: {
          orderBy: { alias: 'asc' },
          include: { document: { select: { id: true, name: true, status: true } } },
        },
      },
    });
  }

  /** Chats that include a given document, most recently used first (decision D21). */
  async findChatsForDocument(documentId: string): Promise<Array<ChatWithRelations & { _count: { messages: number } }>> {
    return this.prisma.chat.findMany({
      where: { documents: { some: { documentId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        documents: {
          orderBy: { alias: 'asc' },
          include: { document: { select: { id: true, name: true, status: true } } },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async findMessages(chatId: string): Promise<MessageWithQuotes[]> {
    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: {
        quotes: {
          orderBy: { citation: 'asc' },
          select: {
            id: true,
            citation: true,
            text: true,
            status: true,
            documentId: true,
            matchKind: true,
            matches: true,
            document: { select: { name: true } },
          },
        },
      },
    });
  }

  async countMessages(chatId: string): Promise<number> {
    return this.prisma.message.count({ where: { chatId } });
  }

  async addUserMessage(chatId: string, content: string): Promise<Message> {
    return this.prisma.message.create({
      data: { chatId, role: 'USER', content, status: 'DONE' },
    });
  }

  async addAssistantMessage(
    chatId: string,
    mode: RetrievalMode,
    coverage: MessageCoverageInput,
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        chatId,
        role: 'ASSISTANT',
        content: '',
        status: 'STREAMING',
        mode,
        coverage: coverage === null ? Prisma.DbNull : (coverage as unknown as Prisma.InputJsonValue),
      },
    });
  }

  /**
   * Finalises an assistant message.
   *
   * One update, so a message can never be left with its text saved but its status still
   * STREAMING — which the UI would show as an answer that never finishes.
   */
  async finishAssistantMessage(input: {
    messageId: string;
    content: string;
    status: MessageStatus;
    answerStatus: AnswerStatus | null;
    coverage: MessageCoverageInput;
    errorCode?: string | null;
    quotes: PersistQuoteInput[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: input.messageId },
        data: {
          content: input.content,
          status: input.status,
          answerStatus: input.answerStatus,
          errorCode: input.errorCode ?? null,
          ...(input.coverage === null
            ? {}
            : { coverage: input.coverage as unknown as Prisma.InputJsonValue }),
        },
      });

      // Replace rather than append, so a retried finalisation cannot duplicate quotes.
      await tx.quote.deleteMany({ where: { messageId: input.messageId } });

      if (input.quotes.length > 0) {
        await tx.quote.createMany({
          data: input.quotes.map((quote) => ({
            messageId: input.messageId,
            documentId: quote.documentId,
            citation: quote.citation,
            text: quote.text,
            status: quote.status,
            matchKind: quote.matchKind,
            matches: quote.matches as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    });
  }

  /** Saves partial text immediately, so Stop survives a reload even if nothing else runs. */
  async savePartialContent(messageId: string, content: string): Promise<void> {
    await this.prisma.message.update({ where: { id: messageId }, data: { content } });
  }

  /** Sets the title from the first question, once (decision D21). */
  async setTitleIfEmpty(chatId: string, title: string): Promise<void> {
    await this.prisma.chat.updateMany({
      where: { id: chatId, title: null },
      data: { title: title.slice(0, 60) },
    });
  }

  /** Bumps `updatedAt` so the history list orders by recency. */
  async touch(chatId: string): Promise<void> {
    await this.prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.prisma.chat.delete({ where: { id: chatId } });
  }

  /**
   * Marks long-abandoned STREAMING messages as errored.
   *
   * A browser that disappears without closing the connection cleanly leaves a message
   * STREAMING forever, and the UI would show it as an answer still being written
   * (ARCHITECTURE section 7).
   */
  async failStaleStreamingMessages(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const result = await this.prisma.message.updateMany({
      where: { status: 'STREAMING', createdAt: { lt: cutoff } },
      data: { status: 'ERROR', errorCode: 'INTERNAL' },
    });
    return result.count;
  }
}
