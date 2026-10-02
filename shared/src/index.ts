/**
 * @ca/shared — the contracts both sides agree on.
 *
 * Only zod schemas, enums, types and small pure functions live here: no framework code,
 * no Node-only and no browser-only APIs, because this package is compiled once and consumed
 * by the NestJS server and the Next.js client alike (ARCHITECTURE section 1).
 */
export * from './chat';
export * from './errors';
export * from './documents';
export * from './text';
