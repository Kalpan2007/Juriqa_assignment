import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ZodType } from 'zod';
import { AppConfigService } from '../../config/config.service';
import { AppError } from '../../core/errors/app-error';
import { estimateTokens } from '../../core/utils/tokens';
import { TokenBucketLimiter } from './rate-limiter';
import { LlmUsageRepository } from './llm-usage.repository';

/**
 * The single door to the LLM (ARCHITECTURE section 12).
 *
 * Provider-agnostic by construction: an OpenAI-compatible client whose base URL, model and
 * key all come from the environment, so switching provider is configuration rather than code.
 *
 * Three behaviours specific to the configured model (gpt-oss-20b on Groq), all verified
 * against the live API rather than assumed:
 *
 *  1. It is a REASONING model: it emits `reasoning` deltas before `content` deltas, and its
 *     reasoning tokens are billed as output. A small `max_tokens` therefore produces an
 *     EMPTY answer — reasoning consumes the whole allowance. So `reasoning_effort` is set to
 *     `low` (first content token in under a second, versus noticeably longer at `medium`),
 *     and the output reserve is generous.
 *  2. Only `delta.content` is answer text. `delta.reasoning` is the model thinking aloud and
 *     must never reach the user.
 *  3. JSON mode fails with a 400 ("Failed to generate JSON") if the token allowance is too
 *     small for reasoning plus the object, so structured calls get a large ceiling.
 */

export type LlmPurpose =
  | 'chat.answer'
  | 'chat.thorough.map'
  | 'chat.thorough.reduce'
  | 'comparison.summary'
  | 'redline.plan';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  purpose: LlmPurpose;
  messages: ChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Called for each piece of ANSWER text. Reasoning is deliberately not passed on. */
  onDelta: (text: string) => void;
  /** Called when a rate limit forces a wait, so the user can be told. */
  onRetryNotice?: (attempt: number, waitMs: number) => void;
}

export interface StructuredOptions<T> {
  purpose: LlmPurpose;
  messages: ChatMessage[];
  schema: ZodType<T>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onRetryNotice?: (attempt: number, waitMs: number) => void;
}

/** Retries on 429 (ARCHITECTURE section 12). */
const MAX_RATE_LIMIT_RETRIES = 3;

/** Used when the provider sends a 429 with no Retry-After header. */
const DEFAULT_RETRY_WAIT_MS = 2_000;

/** JSON mode needs room for reasoning plus the object, or it 400s. */
const STRUCTURED_OUTPUT_TOKENS = 2_000;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly limiter: TokenBucketLimiter;
  readonly model: string;
  readonly maxInputTokens: number;

  constructor(
    config: AppConfigService,
    private readonly usage: LlmUsageRepository,
  ) {
    const { apiKey, baseUrl, model, maxInputTokens, tpmBudget } = config.llm;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: 60_000,
      // Retries are handled here, not in the SDK, so a 429 can emit a visible notice.
      maxRetries: 0,
    });
    this.model = model;
    this.maxInputTokens = maxInputTokens;
    this.limiter = new TokenBucketLimiter(tpmBudget);
  }

  /**
   * Streams an answer, forwarding only content deltas.
   * Returns the full text and whether it completed or was aborted.
   */
  async stream(options: StreamOptions): Promise<{ text: string; aborted: boolean }> {
    const promptText = options.messages.map((message) => message.content).join('\n');
    await this.limiter.acquire(estimateTokens(promptText) + options.maxOutputTokens);

    const startedAt = Date.now();
    let text = '';
    let attempt = 0;

    for (;;) {
      try {
        const stream = await this.client.chat.completions.create(
          {
            model: this.model,
            messages: options.messages,
            max_tokens: options.maxOutputTokens,
            stream: true,
            // Keeps the pre-answer pause short; the model still reasons, just less.
            reasoning_effort: 'low',
            stream_options: { include_usage: true },
          },
          { signal: options.signal },
        );

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const part of stream) {
          if (part.usage) {
            inputTokens = part.usage.prompt_tokens ?? 0;
            outputTokens = part.usage.completion_tokens ?? 0;
          }
          const delta = part.choices[0]?.delta;
          // `delta.reasoning` is the model thinking aloud — never shown to the user.
          const content = delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            text += content;
            options.onDelta(content);
          }
        }

        await this.record(options.purpose, inputTokens || estimateTokens(promptText), outputTokens || estimateTokens(text), startedAt, true);
        return { text, aborted: false };
      } catch (error) {
        // Stop pressed: keep whatever was streamed. Not a failure.
        if (this.isAbort(error, options.signal)) {
          await this.record(options.purpose, estimateTokens(promptText), estimateTokens(text), startedAt, true);
          return { text, aborted: true };
        }

        const retryWaitMs = this.rateLimitWaitMs(error);
        if (retryWaitMs !== null && attempt < MAX_RATE_LIMIT_RETRIES) {
          attempt += 1;
          options.onRetryNotice?.(attempt, retryWaitMs);
          this.logger.warn({ attempt, retryWaitMs }, 'LLM rate limited; retrying');
          await this.sleep(retryWaitMs, options.signal);
          continue;
        }

        await this.record(options.purpose, estimateTokens(promptText), 0, startedAt, false, this.errorCode(error));
        throw this.toAppError(error);
      }
    }
  }

  /**
   * A structured call, validated with zod, with ONE repair attempt.
   *
   * The repair sends the validation error back and asks again. One attempt, not a loop: if
   * the model cannot produce the shape twice, a third try is unlikely to help and the caller
   * needs to degrade gracefully instead.
   */
  async structured<T>(options: StructuredOptions<T>): Promise<T> {
    const maxOutputTokens = options.maxOutputTokens ?? STRUCTURED_OUTPUT_TOKENS;
    let messages = [...options.messages];

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const promptText = messages.map((message) => message.content).join('\n');
      await this.limiter.acquire(estimateTokens(promptText) + maxOutputTokens);

      const startedAt = Date.now();
      let raw = '';

      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages,
            max_tokens: maxOutputTokens,
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
          },
          { signal: options.signal },
        );

        raw = response.choices[0]?.message.content ?? '';
        await this.record(
          options.purpose,
          response.usage?.prompt_tokens ?? 0,
          response.usage?.completion_tokens ?? 0,
          startedAt,
          true,
        );
      } catch (error) {
        const retryWaitMs = this.rateLimitWaitMs(error);
        if (retryWaitMs !== null) {
          options.onRetryNotice?.(attempt + 1, retryWaitMs);
          await this.sleep(retryWaitMs, options.signal);
          attempt -= 1; // a rate limit is not a failed attempt
          continue;
        }
        await this.record(options.purpose, 0, 0, startedAt, false, this.errorCode(error));
        throw this.toAppError(error);
      }

      const parsed = this.tryParse(options.schema, raw);
      if (parsed.ok) return parsed.value;

      if (attempt === 0) {
        this.logger.warn({ purpose: options.purpose, error: parsed.error }, 'Structured call failed validation; repairing');
        messages = [
          ...options.messages,
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `That response did not match the required shape: ${parsed.error}\nReply again with ONLY valid JSON in the required shape.`,
          },
        ];
        continue;
      }

      throw new AppError(
        'LLM_INVALID_RESPONSE',
        502,
        'The AI service returned something this app could not read. Please try again.',
      );
    }

    throw new AppError('LLM_INVALID_RESPONSE', 502, 'The AI service returned an unusable response.');
  }

  /** Reserves rate-limit budget without making a call — used before a batch. */
  async reserveBudget(promptText: string, expectedOutputTokens: number): Promise<void> {
    await this.limiter.acquire(estimateTokens(promptText) + expectedOutputTokens);
  }

  /**
   * True when the provider answers. Deliberately does not spend tokens: `/health/ready` is
   * polled, and a health check that costs money is a bad health check.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'LLM health check failed');
      return false;
    }
  }

  private tryParse<T>(schema: ZodType<T>, raw: string): { ok: true; value: T } | { ok: false; error: string } {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'the response was not valid JSON' };
    }
    const result = schema.safeParse(json);
    if (result.success) return { ok: true, value: result.data };

    return {
      ok: false,
      error: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    };
  }

  /** Milliseconds to wait for a 429, or null when the error is not a rate limit. */
  private rateLimitWaitMs(error: unknown): number | null {
    if (!(error instanceof OpenAI.APIError) || error.status !== 429) return null;

    const header = error.headers?.get?.('retry-after');
    if (typeof header === 'string') {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1_000, 30_000);
    }
    return DEFAULT_RETRY_WAIT_MS;
  }

  private isAbort(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted) return true;
    if (error instanceof OpenAI.APIUserAbortError) return true;
    return error instanceof Error && error.name === 'AbortError';
  }

  private errorCode(error: unknown): string {
    if (!(error instanceof OpenAI.APIError)) return 'LLM_UNAVAILABLE';
    if (error.status === 429 || error.status === 413) return 'LLM_RATE_LIMITED';
    if (error.status === 401 || error.status === 403) return 'LLM_UNAVAILABLE';
    if (error instanceof OpenAI.APIConnectionTimeoutError) return 'LLM_TIMEOUT';
    return 'LLM_UNAVAILABLE';
  }

  /** Provider errors never reach the client verbatim (ARCHITECTURE section 3.1). */
  private toAppError(error: unknown): AppError {
    const code = this.errorCode(error);
    this.logger.error({ err: error, code }, 'LLM call failed');

    switch (code) {
      case 'LLM_RATE_LIMITED':
        return new AppError('LLM_RATE_LIMITED', 503, 'The AI service is busy. Please try again in a moment.');
      case 'LLM_TIMEOUT':
        return new AppError('LLM_TIMEOUT', 504, 'The AI service did not respond in time. Please try again.');
      default:
        return new AppError('LLM_UNAVAILABLE', 503, 'The AI service is unavailable. Please try again.');
    }
  }

  private async record(
    purpose: LlmPurpose,
    inputTokens: number,
    outputTokens: number,
    startedAt: number,
    ok: boolean,
    errorCode?: string,
  ): Promise<void> {
    try {
      await this.usage.record({
        purpose,
        model: this.model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
        ok,
        errorCode,
      });
    } catch (error) {
      // Usage accounting must never break an answer.
      this.logger.warn({ err: error }, 'Could not record LLM usage');
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }
}
