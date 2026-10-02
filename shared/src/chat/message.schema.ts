import { z } from 'zod';
import { quoteSchema } from './quote.schema';

export const MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;
export const MESSAGE_STATUSES = ['STREAMING', 'DONE', 'STOPPED', 'ERROR'] as const;
export const ANSWER_STATUSES = ['ANSWERED', 'NOT_FOUND', 'UNSUPPORTED', 'PARTIAL'] as const;
export const RETRIEVAL_MODES = ['RETRIEVAL', 'THOROUGH'] as const;

export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const answerStatusSchema = z.enum(ANSWER_STATUSES);
export const retrievalModeSchema = z.enum(RETRIEVAL_MODES);

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type AnswerStatus = z.infer<typeof answerStatusSchema>;
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

/**
 * What the app actually read before answering (ARCHITECTURE section 6).
 *
 * This is shown under EVERY answer and is never hidden. The assignment's hardest rule is
 * that an app which read part of a document must not answer as though it read all of it, and
 * this object is the mechanism: the UI renders it verbatim, so a partial read is always
 * visible to the user.
 */
export const coverageSchema = z.object({
  mode: retrievalModeSchema,
  /** Sections actually sent to the model. */
  chunksRead: z.number().int().nonnegative(),
  /** Sections the document has, excluding boilerplate. */
  chunksTotal: z.number().int().nonnegative(),
  /** Labels of the sections read — clause refs or headings (decision D13). */
  sectionsCovered: z.array(z.string()),
  /** Page ranges, PDF only; null for DOCX, which has no real pages (decision D13). */
  pagesCovered: z.array(z.string()).nullable(),
  /**
   * True ONLY when every non-boilerplate section was read AND no page was skipped.
   * An answer may assert that something is absent only when this is true.
   */
  complete: z.boolean(),
  /** Pages with no readable text, so absence can never be claimed over them. */
  skippedPages: z.array(z.number().int().positive()),
  /** Set when a thorough run stopped early, e.g. the provider rate-limited us. */
  stoppedEarlyReason: z.string().nullable(),
});

export type CoverageDto = z.infer<typeof coverageSchema>;

/** Per-document coverage for a multi-document answer (slice F6). */
export const documentCoverageSchema = z.object({
  documentId: z.uuid(),
  documentName: z.string(),
  alias: z.string(),
  coverage: coverageSchema,
});

export type DocumentCoverageDto = z.infer<typeof documentCoverageSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  status: messageStatusSchema,
  answerStatus: answerStatusSchema.nullable(),
  mode: retrievalModeSchema,
  coverage: coverageSchema.nullable(),
  /** One entry per document in a multi-document chat; empty for a single-document chat. */
  documentCoverage: z.array(documentCoverageSchema),
  errorCode: z.string().nullable(),
  quotes: z.array(quoteSchema),
  createdAt: z.iso.datetime(),
});

export type MessageDto = z.infer<typeof messageSchema>;

/**
 * True when the answer's own text claims something is absent.
 *
 * Used for the post-check in ARCHITECTURE section 6: in RETRIEVAL mode the UI adds a
 * "based on N of M sections" warning next to such a claim, because the model cannot know
 * what it was not shown. Kept in `shared/` so the server and the client agree on what counts
 * as an absence claim.
 */
const ABSENCE_PATTERNS: readonly RegExp[] = [
  /\bdoes not (?:contain|include|mention|have|specify|provide)\b/i,
  /\bthere is no\b/i,
  /\bthere are no\b/i,
  /\bno such (?:clause|provision|section|term)\b/i,
  /\bis not (?:present|included|mentioned|specified)\b/i,
  /\bthe (?:document|agreement|contract) (?:does not|doesn't)\b/i,
  /\bnot found anywhere\b/i,
  /\bno mention of\b/i,
];

export function claimsAbsence(answerText: string): boolean {
  return ABSENCE_PATTERNS.some((pattern) => pattern.test(answerText));
}

/**
 * True when an absence claim needs the partial-coverage warning: the answer says something
 * is missing, but the app did not read the whole document.
 */
export function needsCoverageWarning(answerText: string, coverage: CoverageDto | null): boolean {
  if (coverage === null) return false;
  if (coverage.complete) return false;
  return claimsAbsence(answerText);
}
