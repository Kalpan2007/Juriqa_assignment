import { createHash } from 'node:crypto';

/** sha256 of a buffer, used for duplicate detection and the comparison cache key (D19). */
export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
