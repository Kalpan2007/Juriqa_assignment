import { z } from 'zod';
import { messageSchema, retrievalModeSchema } from './message.schema';

/** A document taking part in a chat, with the alias the prompt uses ("D1", "D2"). */
export const chatDocumentSchema = z.object({
  documentId: z.uuid(),
  name: z.string(),
  alias: z.string(),
  /** False once the document has been deleted; its quotes stay visible but unclickable. */
  available: z.boolean(),
});

export type ChatDocumentDto = z.infer<typeof chatDocumentSchema>;

export const chatSummarySchema = z.object({
  id: z.uuid(),
  /** Set by the server from the first question (decision D21). */
  title: z.string().nullable(),
  documents: z.array(chatDocumentSchema),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ChatSummaryDto = z.infer<typeof chatSummarySchema>;

export const chatSchema = chatSummarySchema.extend({
  messages: z.array(messageSchema),
});

export type ChatDto = z.infer<typeof chatSchema>;

export const chatListSchema = z.object({ chats: z.array(chatSummarySchema) });
export type ChatListDto = z.infer<typeof chatListSchema>;

/** Maximum documents in one chat (ARCHITECTURE section 9). */
export const MAX_CHAT_DOCUMENTS = 5;

export const createChatSchema = z.object({
  documentIds: z
    .array(z.uuid())
    .min(1, 'Choose at least one document.')
    .max(MAX_CHAT_DOCUMENTS, `You can ask across at most ${MAX_CHAT_DOCUMENTS} documents at once.`),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Type a question.').max(2_000, 'That question is too long.'),
  /** Omitted means "decide for me": the classifier picks the mode. */
  mode: retrievalModeSchema.optional(),
  /** Run a thorough pass over ONE document in a multi-document chat (decision D12). */
  thoroughDocumentId: z.uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
