import { describe, expect, it } from 'vitest';
import { ERROR_CODES, type ErrorCode } from '@ca/shared';
import { errorMessages, resolveErrorMessage } from './error-messages';

/**
 * This is a contract test between the server and the UI, not a formality.
 *
 * CLAUDE.md rule 2 says unsupported inputs get a clear message. The way that silently breaks
 * is someone adding an error code in `shared/` and forgetting the copy here — the user then
 * sees a generic "Something went wrong" for a failure we know exactly how to explain. This
 * test fails the build instead.
 */
describe('errorMessages covers the shared error codes', () => {
  it('has an entry for every ErrorCode', () => {
    const missing = ERROR_CODES.filter((code) => !(code in errorMessages));
    expect(missing, `error codes with no copy: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no entry for a code the server does not define', () => {
    const known = new Set<string>(ERROR_CODES);
    const extra = Object.keys(errorMessages).filter((code) => !known.has(code));
    expect(extra, `copy for unknown codes: ${extra.join(', ')}`).toEqual([]);
  });

  it('gives every message a non-empty title and description', () => {
    for (const code of ERROR_CODES) {
      const message = errorMessages[code];
      expect(message.title.length, `${code} title`).toBeGreaterThan(0);
      expect(message.description.length, `${code} description`).toBeGreaterThan(0);
    }
  });

  it('never leaks the raw code into the title', () => {
    for (const code of ERROR_CODES) {
      expect(errorMessages[code].title).not.toContain(code);
    }
  });
});

describe('resolveErrorMessage', () => {
  it('returns the mapped copy for a known code', () => {
    expect(resolveErrorMessage('SCANNED_PDF')).toBe(errorMessages.SCANNED_PDF);
  });

  it('falls back to the server message for an unknown code', () => {
    const resolved = resolveErrorMessage('SOME_FUTURE_CODE', 'The widget exploded.');
    expect(resolved.description).toBe('The widget exploded.');
  });

  it('falls back to INTERNAL when there is nothing to go on', () => {
    expect(resolveErrorMessage(undefined)).toBe(errorMessages.INTERNAL);
  });

  it('prefers the mapped copy over the server message', () => {
    const resolved = resolveErrorMessage('ENCRYPTED_PDF' satisfies ErrorCode, 'raw provider text');
    expect(resolved.description).not.toContain('raw provider text');
  });
});
