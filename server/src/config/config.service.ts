import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * Typed access to validated configuration.
 *
 * Features inject THIS, never `process.env` and never Nest's untyped ConfigService, so a
 * missing variable is impossible by the time any feature runs (ARCHITECTURE section 3.2).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: NestConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  /**
   * Render injects a per-service PORT, which must win over the shared SERVER_PORT
   * from the root .env (decision D24).
   */
  get port(): number {
    return this.get('PORT') ?? this.get('SERVER_PORT');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get webOrigin(): string {
    return this.get('WEB_ORIGIN');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get supabase(): { url: string; serviceRoleKey: string; bucket: string } {
    return {
      url: this.get('SUPABASE_URL'),
      serviceRoleKey: this.get('SUPABASE_SERVICE_ROLE_KEY'),
      bucket: this.get('SUPABASE_BUCKET'),
    };
  }

  get llm(): {
    apiKey: string;
    baseUrl: string;
    model: string;
    maxInputTokens: number;
    tpmBudget: number;
  } {
    return {
      apiKey: this.get('LLM_API_KEY'),
      baseUrl: this.get('LLM_BASE_URL'),
      model: this.get('LLM_MODEL'),
      maxInputTokens: this.get('LLM_MAX_INPUT_TOKENS'),
      tpmBudget: this.get('LLM_TPM_BUDGET'),
    };
  }

  get maxUploadBytes(): number {
    return this.get('MAX_UPLOAD_MB') * 1024 * 1024;
  }

  get maxUploadMb(): number {
    return this.get('MAX_UPLOAD_MB');
  }

  get maxPages(): number {
    return this.get('MAX_PAGES');
  }
}
