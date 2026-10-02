import { z } from 'zod';

/**
 * Every environment variable the server needs, validated at boot.
 * If anything is missing or malformed the process refuses to start (ARCHITECTURE section 3.2)
 * — a server that boots with a broken config fails later, in a harder place to diagnose.
 *
 * Variables are documented in the root `.env.example`.
 */
export const envSchema = z.object({
  // --- runtime -------------------------------------------------------------
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * The server's port. Named SERVER_PORT because one root `.env` is shared by both apps
   * and a bare PORT would collide with the client's (decision D24). Render injects its own
   * per-service PORT, which wins — see ConfigService.port.
   */
  SERVER_PORT: z.coerce.number().int().positive().default(3001),
  PORT: z.coerce.number().int().positive().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** The single browser origin allowed by CORS. No trailing slash. */
  WEB_ORIGIN: z.url(),

  // --- database ------------------------------------------------------------
  /**
   * Supabase SESSION pooler, port 5432. Never the direct connection (IPv6-only, unreachable
   * from Render) and never the transaction pooler on 6543 (breaks migrations).
   */
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres connection string',
    })
    .refine((url) => !url.includes(':6543'), {
      message:
        'DATABASE_URL uses the transaction pooler (:6543), which breaks migrations and prepared statements. Use the session pooler on :5432.',
    }),

  // --- storage -------------------------------------------------------------
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_BUCKET: z.string().min(1).default('contracts'),

  // --- llm -----------------------------------------------------------------
  LLM_API_KEY: z.string().min(10),
  LLM_BASE_URL: z.url(),
  LLM_MODEL: z.string().min(1),
  /** Input-token ceiling the budgeter may fill, before the output reserve. */
  LLM_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(12_000),
  /** Tokens per minute for the in-process rate limiter. */
  LLM_TPM_BUDGET: z.coerce.number().int().positive().default(25_000),

  // --- limits --------------------------------------------------------------
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  /** Page ceiling (decision D23). */
  MAX_PAGES: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env`, throwing a single readable error listing every problem at once
 * rather than failing on the first one.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration.\n${problems}\n\n` +
        'Copy .env.example to .env at the repository root and fill in the real values.',
    );
  }
  return result.data;
}
