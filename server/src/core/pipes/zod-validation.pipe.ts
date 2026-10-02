import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error';

/**
 * Validates a request payload with a zod schema from `@ca/shared`.
 *
 * One schema per payload, shared with the client (ARCHITECTURE principle 5), so the two sides
 * cannot disagree about a shape. Controllers only validate and delegate; nothing downstream
 * ever receives unvalidated input.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new AppError('VALIDATION_FAILED', 400, 'Some of the values sent were not valid.', {
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}

/** Convenience factory so controllers read as `@Body(zodBody(schema))`. */
export function zodBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
