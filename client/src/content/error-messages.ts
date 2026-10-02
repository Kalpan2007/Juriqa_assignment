import type { ErrorCode } from '@ca/shared';

export interface ErrorMessage {
  title: string;
  description: string;
  /** Label for the recovery action, when there is something useful to do. */
  action?: string;
}

/**
 * Maps every server error code to text a person can act on (ARCHITECTURE section 13.2).
 *
 * The assignment is explicit that unsupported inputs must get a clear message rather than a
 * generic failure, so each upload rejection says exactly what was wrong AND what to do about
 * it. An unknown code falls back to the server's own message — never to "Error".
 */
export const errorMessages: Record<ErrorCode, ErrorMessage> = {
  // --- generic --------------------------------------------------------------
  INTERNAL: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred on our side. Please try again.',
    action: 'Try again',
  },
  BAD_REQUEST: {
    title: 'That request could not be handled',
    description: 'Something about the request was not valid.',
  },
  NOT_FOUND: {
    title: 'Not found',
    description: 'That item no longer exists.',
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    description: 'Please wait a moment and try again.',
    action: 'Try again',
  },
  VALIDATION_FAILED: {
    title: 'Some values were not valid',
    description: 'Please check what you entered and try again.',
  },

  // --- upload / file type ---------------------------------------------------
  UNSUPPORTED_TYPE: {
    title: 'This file type is not supported',
    description: 'Only PDF and DOCX files can be analysed.',
  },
  LEGACY_DOC_FORMAT: {
    title: 'Old .doc format is not supported',
    description: 'Open the file in Word and save it as .docx, then upload it again.',
  },
  EMPTY_FILE: {
    title: 'That file is empty',
    description: 'The file contains no data. Check the file and try again.',
  },
  FILE_TOO_LARGE: {
    title: 'That file is too large',
    description: 'Please upload a smaller file.',
  },
  ENCRYPTED_PDF: {
    title: 'This PDF is password-protected',
    description: 'Remove the password and upload the file again.',
  },
  ENCRYPTED_DOCX: {
    title: 'This document is protected',
    description: 'Remove the protection in Word and upload the file again.',
  },
  CORRUPT_FILE: {
    title: 'This file could not be read',
    description: 'It appears to be damaged or incomplete.',
  },
  TOO_MANY_PAGES: {
    title: 'This document has too many pages',
    description: 'Please split it into smaller documents.',
  },
  SCANNED_PDF: {
    title: 'This PDF contains no readable text',
    description:
      'It looks like a scan or a set of images. Reading scanned text (OCR) is not supported, so this document cannot be analysed.',
  },

  // --- document lifecycle ---------------------------------------------------
  DOCUMENT_NOT_READY: {
    title: 'This document is still being prepared',
    description: 'Wait until it is ready, then try again.',
  },
  DOCUMENT_DELETED: {
    title: 'This document has been deleted',
    description: 'It is no longer available.',
  },
  EXTRACTION_FAILED: {
    title: 'The text could not be extracted',
    description: 'Something went wrong while reading this document.',
    action: 'Try again',
  },

  // --- chat / llm -----------------------------------------------------------
  LLM_UNAVAILABLE: {
    title: 'The AI service is unavailable',
    description: 'It could not be reached. Your documents are unaffected.',
    action: 'Try again',
  },
  LLM_TIMEOUT: {
    title: 'The answer took too long',
    description: 'The AI service did not respond in time.',
    action: 'Try again',
  },
  LLM_RATE_LIMITED: {
    title: 'The AI service is busy',
    description: 'Too many requests at once. Please wait a moment.',
    action: 'Try again',
  },
  LLM_INVALID_RESPONSE: {
    title: 'The answer could not be read',
    description: 'The AI service returned something unexpected.',
    action: 'Try again',
  },
  CHAT_NOT_FOUND: {
    title: 'This chat no longer exists',
    description: 'It may have been deleted along with its document.',
  },
  TOO_MANY_DOCUMENTS: {
    title: 'Too many documents selected',
    description: 'You can ask across at most 5 documents at once.',
  },
  NO_DOCUMENTS_SELECTED: {
    title: 'No documents selected',
    description: 'Choose at least one document to ask about.',
  },

  // --- comparison -----------------------------------------------------------
  COMPARISON_SAME_DOCUMENT: {
    title: 'Those are the same document',
    description: 'Choose two different documents to compare.',
  },
  COMPARISON_FAILED: {
    title: 'The comparison could not be completed',
    description: 'Something went wrong while comparing the two versions.',
    action: 'Try again',
  },

  // --- redline --------------------------------------------------------------
  REDLINE_REQUIRES_DOCX: {
    title: 'Tracked changes need a .docx',
    description:
      'Word tracked changes can only be written into the original .docx file. This document is a PDF.',
  },
  REDLINE_SELF_CHECK_FAILED: {
    title: 'The edited file did not pass our checks',
    description:
      'The result was not offered for download because it could not be verified as correct. Your original document is unchanged.',
  },
  REDLINE_NO_APPLICABLE_EDITS: {
    title: 'No edits could be applied',
    description: 'None of the proposed edits could be made safely. See the reasons listed above.',
  },
  REDLINE_FAILED: {
    title: 'The tracked changes could not be written',
    description: 'Something went wrong. Your original document is unchanged.',
    action: 'Try again',
  },

  // --- infrastructure -------------------------------------------------------
  STORAGE_UNAVAILABLE: {
    title: 'File storage is unavailable',
    description: 'The file could not be saved or read. Please try again.',
    action: 'Try again',
  },
  QUEUE_UNAVAILABLE: {
    title: 'Background processing is unavailable',
    description: 'Documents cannot be processed right now. Please try again shortly.',
    action: 'Try again',
  },
};

/**
 * Resolves an error into display text, falling back to the server's own message for a code
 * this client does not know yet — so a newer server never shows the user "undefined".
 */
export function resolveErrorMessage(
  code: string | undefined,
  serverMessage?: string,
): ErrorMessage {
  if (code && code in errorMessages) {
    return errorMessages[code as ErrorCode];
  }
  if (serverMessage) {
    return { title: 'Something went wrong', description: serverMessage, action: 'Try again' };
  }
  return errorMessages.INTERNAL;
}
