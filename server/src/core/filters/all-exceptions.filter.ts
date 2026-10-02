import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorResponse } from '@ca/shared';
import { AppError } from '../errors/app-error';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

/**
 * Turns every thrown value into the one error shape the client knows how to parse
 * (ARCHITECTURE section 3.1).
 *
 * The rule that matters: only errors we raised deliberately carry their message to the user.
 * Everything else becomes a generic INTERNAL message, with the real detail written to the log
 * — so a Prisma, Supabase or Groq error can never reach the browser verbatim.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? (request.headers[REQUEST_ID_HEADER] as string | undefined);

    const { status, code, message, details, logLevel } = this.describe(exception);

    const logPayload = {
      requestId,
      method: request.method,
      url: request.originalUrl,
      status,
      code,
      err: exception,
    };
    if (logLevel === 'error') {
      this.logger.error(logPayload, `${code}: ${this.rawMessage(exception)}`);
    } else {
      this.logger.warn(logPayload, `${code}: ${message}`);
    }

    // A stream may already have sent headers; there is nothing well-formed left to send.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ErrorResponse = {
      error: { code, message, ...(requestId ? { requestId } : {}), ...(details ? { details } : {}) },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: ErrorCode | string;
    message: string;
    details?: Array<{ path: string; message: string }>;
    logLevel: 'warn' | 'error';
  } {
    if (AppError.isAppError(exception)) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.userMessage,
        ...(exception.details ? { details: [...exception.details] } : {}),
        // Deliberate 4xx errors are expected traffic, not incidents.
        logLevel: exception.status >= 500 ? 'error' : 'warn',
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'Some of the values sent were not valid.',
        details: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        logLevel: 'warn',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.codeForStatus(status),
        // Nest's own messages (404 on an unknown route, 429 from the throttler) are safe.
        message: this.httpExceptionMessage(exception),
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
      logLevel: 'error',
    };
  }

  private httpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const { message } = response as { message: unknown };
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('; ');
    }
    return exception.message;
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'FILE_TOO_LARGE';
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return 'UNSUPPORTED_TYPE';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL';
    }
  }

  private rawMessage(exception: unknown): string {
    if (exception instanceof Error) return exception.message;
    return String(exception);
  }
}
