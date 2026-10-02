import {
  chatListSchema,
  chatSchema,
  chatSummarySchema,
  sseEventSchema,
  type ChatDto,
  type ChatSummaryDto,
  type SendMessageInput,
  type SseEvent,
} from '@ca/shared';
import { api } from '@/lib/api-client';
import { streamSse } from '@/lib/sse-client';

/** Typed calls for the chat feature. Every response is parsed with a schema from @ca/shared. */
export const chatApi = {
  create: (documentIds: string[]): Promise<ChatSummaryDto> =>
    api.post('/chats', { documentIds }, chatSummarySchema),

  get: (chatId: string): Promise<ChatDto> => api.get(`/chats/${chatId}`, chatSchema),

  listForDocument: (documentId: string): Promise<ChatSummaryDto[]> =>
    api.get(`/documents/${documentId}/chats`, chatListSchema).then((data) => data.chats),

  remove: (chatId: string) => api.delete(`/chats/${chatId}`),

  /**
   * Streams an answer.
   *
   * Aborting `signal` IS the Stop button: it closes the connection, the server notices and
   * saves the partial answer. Nothing extra needs to be sent.
   */
  sendMessage: (
    chatId: string,
    body: SendMessageInput,
    signal: AbortSignal,
    onEvent: (event: SseEvent) => void,
  ): Promise<void> =>
    streamSse({
      path: `/chats/${chatId}/messages`,
      body,
      eventSchema: sseEventSchema,
      signal,
      onEvent,
      onInvalidEvent: (raw, error) => {
        // A malformed event is skipped rather than allowed to corrupt the rendered answer.
        console.warn('Ignoring an unreadable stream event', { raw, error });
      },
    }),
};
