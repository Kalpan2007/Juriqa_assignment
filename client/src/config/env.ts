import { z } from 'zod';

/**
 * The client's only configuration value.
 *
 * Validated at module load so a misconfigured deploy fails visibly instead of firing requests
 * at `undefined/documents`. Note that Next inlines NEXT_PUBLIC_* at BUILD time (decision D18),
 * so changing the server URL requires rebuilding the client, not just restarting it.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().refine((url) => !url.endsWith('/'), {
    message: 'NEXT_PUBLIC_API_URL must not end with a trailing slash',
  }),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  throw new Error(
    `Invalid client configuration:\n${parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')}\n\nSet NEXT_PUBLIC_API_URL in the .env at the repository root.`,
  );
}

export const env = {
  apiUrl: parsed.data.NEXT_PUBLIC_API_URL,
} as const;
