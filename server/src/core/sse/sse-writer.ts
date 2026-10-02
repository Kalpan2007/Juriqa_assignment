import type { Response } from 'express';
import { Logger } from '@nestjs/common';

/**
 * Writes Server-Sent Events over a POST response (ARCHITECTURE section 3.6).
 *
 * Why POST and not EventSource: the question body can be long, and EventSource cannot POST.
 * The client reads the stream with `fetch` + ReadableStream and stops it by aborting.
 *
 * Decision D22 — streaming must survive Render's proxy. Three things are required and all
 * three are easy to lose:
 *  - `X-Accel-Buffering: no` and `no-transform`, or the proxy buffers the whole answer and
 *    the user sees nothing until it finishes;
 *  - headers flushed immediately, so the connection is established before the first token;
 *  - a periodic comment line, or an idle connection is closed during a long thorough scan.
 * This must be verified on the deployed URL, because it always works locally.
 */
export const SSE_HEARTBEAT_MS = 15_000;

export class SseWriter<TEvent extends { type: string }> {
  private readonly logger = new Logger(SseWriter.name);
  private heartbeat: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(private readonly res: Response) {}

  /** Sends the SSE headers and starts the heartbeat. Call once, before any event. */
  open(): void {
    this.res.statusCode = 200;
    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    // Tells nginx-style proxies (Render) not to buffer this response.
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders();

    this.heartbeat = setInterval(() => this.comment('ping'), SSE_HEARTBEAT_MS);
    // Node keeps the process alive for a pending timer; a stream must not do that.
    this.heartbeat.unref();
  }

  /**
   * Sends one typed event. Returns false once the stream is closed, so callers can stop
   * producing work for a client that has gone away.
   */
  send(event: TEvent): boolean {
    if (this.closed || this.res.writableEnded) return false;
    const payload = JSON.stringify(event);
    return this.write(`event: ${event.type}\ndata: ${payload}\n\n`);
  }

  /** A comment line: ignored by clients, but it keeps the connection alive through a proxy. */
  comment(text: string): boolean {
    if (this.closed || this.res.writableEnded) return false;
    return this.write(`: ${text}\n\n`);
  }

  private write(chunk: string): boolean {
    try {
      this.res.write(chunk);
      return true;
    } catch (error) {
      // A client that disappears mid-write is normal, not an incident.
      this.logger.debug({ err: error }, 'SSE write failed; treating the stream as closed');
      this.closed = true;
      return false;
    }
  }

  get isClosed(): boolean {
    return this.closed || this.res.writableEnded;
  }

  /** Stops the heartbeat and ends the response. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (!this.res.writableEnded) this.res.end();
  }
}
