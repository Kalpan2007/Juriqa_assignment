import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfigService } from '../../config/config.service';
import { estimateTokens } from '../../core/utils/tokens';
import { TokenBucketLimiter } from './rate-limiter';

/**
 * The single door to the LLM (ARCHITECTURE section 12).
 *
 * Provider-agnostic on purpose: an OpenAI-compatible client with `baseURL`, model and key all
 * from env, so switching provider is a configuration change and not a code change. Slice F0
 * establishes the client, the limiter and the health probe; streaming, structured calls with
 * zod validation, 429 retries and LlmCall logging arrive with chat in F3.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly limiter: TokenBucketLimiter;
  readonly model: string;
  readonly maxInputTokens: number;

  constructor(config: AppConfigService) {
    const { apiKey, baseUrl, model, maxInputTokens, tpmBudget } = config.llm;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: 60_000,
      maxRetries: 0, // retries are handled explicitly so a 429 can emit a user-visible notice
    });
    this.model = model;
    this.maxInputTokens = maxInputTokens;
    this.limiter = new TokenBucketLimiter(tpmBudget);
  }

  /** Reserves budget for a call of this size, waiting if necessary. */
  async reserveBudget(promptText: string, expectedOutputTokens: number): Promise<void> {
    await this.limiter.acquire(estimateTokens(promptText) + expectedOutputTokens);
  }

  /** Raw client for the feature services that own their prompts and parsing. */
  get raw(): OpenAI {
    return this.client;
  }

  /**
   * True when the provider answers. Deliberately does NOT spend tokens on a completion —
   * `/health/ready` is polled, and a health check that costs money is a bad health check.
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
}
