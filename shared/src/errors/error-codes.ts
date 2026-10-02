/**
 * Every error the client can be shown, as a stable string code.
 *
 * The code is the contract: the server throws it, the client maps it to friendly text in
 * `client/src/content/error-messages.ts`. Never change a code's spelling once it is in use —
 * add a new one instead, or the client silently falls back to a generic message.
 */
export const ERROR_CODES = [
  // --- generic -------------------------------------------------------------
  'INTERNAL',
  'BAD_REQUEST',
  'NOT_FOUND',
  'RATE_LIMITED',
  'VALIDATION_FAILED',

  // --- upload / file type (ARCHITECTURE section 4) -------------------------
  'UNSUPPORTED_TYPE',
  'LEGACY_DOC_FORMAT',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'ENCRYPTED_PDF',
  'ENCRYPTED_DOCX',
  'CORRUPT_FILE',
  'TOO_MANY_PAGES',
  'SCANNED_PDF',

  // --- document lifecycle --------------------------------------------------
  'DOCUMENT_NOT_READY',
  'DOCUMENT_DELETED',
  'EXTRACTION_FAILED',

  // --- chat / llm (sections 7, 12) ----------------------------------------
  'LLM_UNAVAILABLE',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_INVALID_RESPONSE',
  'CHAT_NOT_FOUND',
  'TOO_MANY_DOCUMENTS',
  'NO_DOCUMENTS_SELECTED',

  // --- comparison (section 10) --------------------------------------------
  'COMPARISON_SAME_DOCUMENT',
  'COMPARISON_FAILED',

  // --- redline (section 11) -----------------------------------------------
  'REDLINE_REQUIRES_DOCX',
  'REDLINE_SELF_CHECK_FAILED',
  'REDLINE_NO_APPLICABLE_EDITS',
  'REDLINE_FAILED',

  // --- storage / infrastructure -------------------------------------------
  'STORAGE_UNAVAILABLE',
  'QUEUE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** True when `value` is a known error code — used by the client before mapping to copy. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
