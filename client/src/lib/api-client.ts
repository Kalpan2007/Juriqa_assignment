import { errorResponseSchema } from '@ca/shared';
import type { ZodType } from 'zod';
import { env } from '@/config/env';

/**
 * A failed API call, carrying the server's stable error code so the UI can show tailored copy
 * from `content/error-messages.ts` rather than a raw string.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly serverMessage: string,
    readonly requestId?: string,
    readonly details?: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(serverMessage);
    this.name = 'ApiError';
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }
}

/** Thrown when the request never reached the server (offline, DNS, CORS). */
export class NetworkError extends Error {
  readonly code = 'NETWORK';
  constructor(cause?: unknown) {
    super('The server could not be reached.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Schema the successful response is parsed with. Omit for endpoints returning no body. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

/**
 * The single place the client talks to the server.
 *
 * Every response is parsed with a zod schema from `@ca/shared` (ARCHITECTURE principle 5), so
 * a server change that breaks the contract surfaces here as a clear error rather than as
 * `undefined` deep inside a component.
 */
export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema, signal } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      // Let the browser set the multipart boundary itself.
      headers: isFormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An abort is a deliberate user action (Stop), not a failure to report.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError(error);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (!schema) return undefined as T;

  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      'INTERNAL',
      response.status,
      'The server returned data this app did not understand.',
      response.headers.get('x-request-id') ?? undefined,
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

/** Reads the shared error shape, tolerating a response that is not JSON at all. */
async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  try {
    const json: unknown = await response.json();
    const parsed = errorResponseSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiError(code, response.status, message, parsed.data.error.requestId ?? requestId, details);
    }
  } catch {
    // Not JSON — fall through to a status-based message.
  }
  return new ApiError('INTERNAL', response.status, `Request failed (${response.status}).`, requestId);
}

export const api = {
  get: <T>(path: string, schema: ZodType<T>, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'GET', schema, signal }),

  post: <T>(path: string, body?: unknown, schema?: ZodType<T>, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'POST', body, schema, signal }),

  delete: (path: string, signal?: AbortSignal) =>
    apiRequest<void>(path, { method: 'DELETE', signal }),

  /** Absolute URL for a browser-navigable endpoint (file download, iframe src). */
  url: (path: string) => `${env.apiUrl}${path}`,
};
