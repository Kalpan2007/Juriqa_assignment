import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  createChatSchema,
  sendMessageSchema,
  type ChatDto,
  type ChatSummaryDto,
  type SendMessageInput,
  type SseEvent,
} from '@ca/shared';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { SseWriter } from '../../core/sse/sse-writer';
import { AppError } from '../../core/errors/app-error';
import { ChatService } from './chat.service';

/**
 * Chat endpoints (ARCHITECTURE sections 3.6, 3.7 and 7).
 *
 * `GET /documents/:id/chats` lives here rather than in the documents controller: the route
 * returns chats, so the chat feature owns it (decision D14).
 */
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('chats')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createChat(
    @Body(new ZodValidationPipe(createChatSchema)) body: { documentIds: string[] },
  ): Promise<ChatSummaryDto> {
    return this.chat.createChat(body.documentIds);
  }

  @Get('chats/:id')
  async getChat(@Param('id', ParseUUIDPipe) id: string): Promise<ChatDto> {
    return this.chat.getChat(id);
  }

  @Delete('chats/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChat(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.chat.deleteChat(id);
  }

  /** Previous chats for a document, most recent first. */
  @Get('documents/:id/chats')
  async listForDocument(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ chats: ChatSummaryDto[] }> {
    return { chats: await this.chat.listChatsForDocument(id) };
  }

  /**
   * Asks a question and streams the answer.
   *
   * Limited to 10/min because every call spends LLM budget on a public URL (decision D9).
   *
   * `@Res()` is used directly rather than returning an observable, for two reasons: the
   * proxy-safe headers in SseWriter have to be set on the raw response (decision D22), and
   * Stop depends on observing `req.on('close')` — which is what turns a closed browser tab
   * into an aborted LLM request instead of an answer nobody is reading.
   */
  @Post('chats/:id/messages')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const writer = new SseWriter<SseEvent>(response);
    const controller = new AbortController();

    /**
     * The client disconnecting IS the Stop button.
     *
     * This listens on the RESPONSE, not the request, and that distinction matters: for a POST
     * whose body has already been consumed, `request`'s own `close` event does not fire when
     * the client goes away mid-stream, so an abort hung on it never arrives — the browser
     * stops listening while the server keeps generating and paying for tokens. Verified by
     * disconnecting mid-answer: the request logged as aborted and the answer still completed.
     *
     * `writableEnded` tells a real disconnect apart from our own `writer.close()` at the end
     * of a successful answer.
     */
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    // A request destroyed before the response starts streaming still counts as a disconnect.
    request.on('aborted', () => controller.abort());

    writer.open();

    try {
      await this.chat.sendMessage(id, body, writer, controller.signal);
    } catch (error) {
      // Headers are already sent, so an error has to travel as an event rather than a status.
      const appError = AppError.isAppError(error)
        ? error
        : new AppError('INTERNAL', 500, 'Something went wrong while answering.');
      writer.send({ type: 'error', code: appError.code, message: appError.userMessage });
      writer.send({ type: 'done', status: 'ERROR', answerStatus: null });
    } finally {
      writer.close();
    }
  }
}
