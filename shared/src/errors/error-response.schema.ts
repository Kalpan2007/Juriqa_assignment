import { z } from 'zod';
import { ERROR_CODES } from './error-codes';

/**
 * The ONE shape every failed request returns (ARCHITECTURE section 3.1).
 * The global exception filter formats every error into this; the client parses it with
 * this same schema, so a shape change can never drift between the two sides.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES).or(z.string()),
    message: z.string(),
    requestId: z.string().optional(),
    /** Field-level detail, only for VALIDATION_FAILED. Never a stack trace. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
