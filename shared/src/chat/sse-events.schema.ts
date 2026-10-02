import { z } from 'zod';
import { coverageSchema, documentCoverageSchema, retrievalModeSchema } from './message.schema';
import { quoteSchema } from './quote.schema';

/**
 * The streaming protocol (ARCHITECTURE section 3.6).
 *
 * Every event is validated against this schema on the client before it touches the UI, so a
 * malformed or unexpected event cannot corrupt a rendered answer. The order is fixed:
 *
 *   meta → (progress | delta | notice)* → quotes → done
 *
 * `quotes` arrives LAST and only after verification, which is the whole point: text streams
 * immediately so the user sees progress, but nothing is presented as a quotation until our
 * own code has found it in the document.
 */

/** Sent once, immediately, so the client can render the message shell and the mode. */
export const metaEventSchema = z.object({
  type: z.literal('meta'),
  messageId: z.string(),
  mode: retrievalModeSchema,
  coverage: coverageSchema.nullable(),
  documentCoverage: z.array(documentCoverageSchema).optional(),
});

/** Progress through a thorough scan — real counts, not a spinner (slice F4). */
export const progressEventSchema = z.object({
  type: z.literal('progress'),
  done: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  label: z.string(),
});

/** A piece of answer text. */
export const deltaEventSchema = z.object({
  type: z.literal('delta'),
  text: z.string(),
});

/** The verified quotes, after the answer finished. */
export const quotesEventSchema = z.object({
  type: z.literal('quotes'),
  quotes: z.array(quoteSchema),
  /** Replaces the `meta` coverage when a thorough run ended with different numbers. */
  coverage: coverageSchema.nullable(),
  documentCoverage: z.array(documentCoverageSchema).optional(),
});

/**
 * Something the user should know that is not an error: a rate-limit retry, or quotes that
 * could not be parsed. The answer continues.
 */
export const noticeEventSchema = z.object({
  type: z.literal('notice'),
  code: z.string(),
  message: z.string(),
});

export const doneEventSchema = z.object({
  type: z.literal('done'),
  status: z.enum(['DONE', 'STOPPED', 'ERROR']),
  answerStatus: z.enum(['ANSWERED', 'NOT_FOUND', 'UNSUPPORTED', 'PARTIAL']).nullable(),
});

/** A terminal failure. The partial text already sent is kept. */
export const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const sseEventSchema = z.discriminatedUnion('type', [
  metaEventSchema,
  progressEventSchema,
  deltaEventSchema,
  quotesEventSchema,
  noticeEventSchema,
  doneEventSchema,
  errorEventSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
export type MetaEvent = z.infer<typeof metaEventSchema>;
export type ProgressEvent = z.infer<typeof progressEventSchema>;
export type DeltaEvent = z.infer<typeof deltaEventSchema>;
export type QuotesEvent = z.infer<typeof quotesEventSchema>;
export type NoticeEvent = z.infer<typeof noticeEventSchema>;
export type DoneEvent = z.infer<typeof doneEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;

/**
 * The delimiter the model is asked to put between its answer and its quote JSON.
 *
 * It lives here because BOTH sides need it: the server's stream parser splits on it, and the
 * prompt that asks for it is built from the same constant. A mismatch would mean the parser
 * never finds the quotes and every answer silently has none.
 */
export const QUOTES_DELIMITER = '---QUOTES---';
