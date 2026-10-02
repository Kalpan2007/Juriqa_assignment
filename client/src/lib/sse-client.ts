import type { ZodType } from 'zod';
import { env } from '@/config/env';
import { ApiError, NetworkError } from './api-client';

/**
 * Reads a Server-Sent Events stream sent over POST (ARCHITECTURE section 3.6).
 *
 * `EventSource` cannot POST and cannot send a body, so the stream is read from `fetch` with a
 * ReadableStream instead. That also gives us Stop for free: aborting the signal closes the
 * connection, the server notices via `req.on('close')` and saves the partial answer.
 *
 * Every event is validated with a zod schema from `@ca/shared` before reaching the UI, so a
 * malformed or unexpected event can never corrupt the rendered answer.
 */
export interface SseOptions<TEvent> {
  path: string;
  body: unknown;
  eventSchema: ZodType<TEvent>;
  signal: AbortSignal;
  onEvent: (event: TEvent) => void;
  /** Called for an event that fails validation. Default: warn and skip. */
  onInvalidEvent?: (raw: string, error: unknown) => void;
}

export async function streamSse<TEvent>({
  path,
  body,
  eventSchema,
  signal,
  onEvent,
  onInvalidEvent,
}: SseOptions<TEvent>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    throw new NetworkError(error);
  }

  if (!response.ok) {
    // An error before the stream opens arrives as ordinary JSON.
    let code = 'INTERNAL';
    let message = `Request failed (${response.status}).`;
    try {
      const json = (await response.json()) as { error?: { code?: string; message?: string } };
      code = json.error?.code ?? code;
      message = json.error?.message ?? message;
    } catch {
      // not JSON; keep the status-based message
    }
    throw new ApiError(code, response.status, message, response.headers.get('x-request-id') ?? undefined);
  }

  if (!response.body) throw new NetworkError('The server returned no stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. A chunk can split one anywhere, so only
      // complete events are consumed and the remainder stays in the buffer.
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        handleRawEvent(rawEvent, eventSchema, onEvent, onInvalidEvent);
        separator = buffer.indexOf('\n\n');
      }
    }
    // A final event with no trailing blank line (server closed immediately after writing).
    if (buffer.trim().length > 0) {
      handleRawEvent(buffer, eventSchema, onEvent, onInvalidEvent);
    }
  } catch (error) {
    // Stop was pressed: the partial answer is already saved server-side.
    if (signal.aborted) return;
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function handleRawEvent<TEvent>(
  rawEvent: string,
  schema: ZodType<TEvent>,
  onEvent: (event: TEvent) => void,
  onInvalidEvent?: (raw: string, error: unknown) => void,
): void {
  // Comment lines (": ping") are the proxy heartbeat and carry no data.
  const dataLines = rawEvent
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  if (dataLines.length === 0) return;

  const payload = dataLines.join('\n');
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch (error) {
    onInvalidEvent?.(payload, error);
    return;
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    onInvalidEvent?.(payload, parsed.error);
    return;
  }
  onEvent(parsed.data);
}
