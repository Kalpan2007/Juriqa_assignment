import type { ErrorCode } from '@ca/shared';

/**
 * The only error type features throw on purpose.
 *
 * It carries a stable machine code, the HTTP status, and a message that is SAFE to show a
 * user. The global filter turns it into the shared error response shape; anything that is not
 * an AppError becomes a generic INTERNAL error so provider messages and stack traces can
 * never leak to the client (ARCHITECTURE section 3.1).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly details?: ReadonlyArray<{ path: string; message: string }>;
  /** Non-user-facing context for the logs only. */
  readonly logContext?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    userMessage: string,
    options?: {
      details?: ReadonlyArray<{ path: string; message: string }>;
      logContext?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(userMessage, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.details = options?.details;
    this.logContext = options?.logContext;
  }

  static badRequest(code: ErrorCode, message: string): AppError {
    return new AppError(code, 400, message);
  }

  static notFound(code: ErrorCode, message: string): AppError {
    return new AppError(code, 404, message);
  }

  static unsupportedType(message: string): AppError {
    return new AppError('UNSUPPORTED_TYPE', 415, message);
  }

  static tooLarge(message: string): AppError {
    return new AppError('FILE_TOO_LARGE', 413, message);
  }

  static internal(message = 'Something went wrong. Please try again.'): AppError {
    return new AppError('INTERNAL', 500, message);
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
