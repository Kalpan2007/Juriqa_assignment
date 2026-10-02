import { describe, expect, it } from 'vitest';
import { QuoteVerifierService } from '../quote-verifier.service';

/**
 * The service layer: the cache, and the rule that a quote is checked against one document's
 * text and nothing else.
 */
const CONTRACT_A = 'The liability of Alpha FZ-LLC shall not exceed AED 100,000 in aggregate.';
const CONTRACT_B = 'The liability of Beta DMCC shall not exceed AED 500,000 in aggregate.';

describe('QuoteVerifierService', () => {
  it('verifies a genuine quote', () => {
    const service = new QuoteVerifierService();
    const result = service.verify('doc-a', CONTRACT_A, 'shall not exceed AED 100,000');

    expect(result.status).toBe('VERIFIED');
    if (result.status !== 'VERIFIED') return;
    expect(result.matchKind).toBe('EXACT_WS');
    expect(CONTRACT_A.slice(result.matches[0]!.start, result.matches[0]!.end)).toBe(
      'shall not exceed AED 100,000',
    );
  });

  it('rejects a quote with a reason', () => {
    const service = new QuoteVerifierService();
    const result = service.verify('doc-a', CONTRACT_A, 'shall not exceed AED 999,999');

    expect(result).toEqual({ status: 'UNVERIFIED', reason: 'NOT_FOUND' });
  });

  it('checks a quote ONLY against the document it was attributed to', () => {
    /**
     * This is the multi-document rule (section 9). A quote that genuinely exists in B must
     * be UNVERIFIED when the model attributed it to A — re-attributing it silently would
     * tell the user that document A says something it does not.
     */
    const service = new QuoteVerifierService();

    const againstB = service.verify('doc-b', CONTRACT_B, 'Beta DMCC shall not exceed AED 500,000');
    expect(againstB.status).toBe('VERIFIED');

    const againstA = service.verify('doc-a', CONTRACT_A, 'Beta DMCC shall not exceed AED 500,000');
    expect(againstA.status).toBe('UNVERIFIED');
  });

  it('marks a quote attributed to an unknown document as unverified', () => {
    const service = new QuoteVerifierService();
    expect(service.unknownDocument()).toEqual({
      status: 'UNVERIFIED',
      reason: 'UNKNOWN_DOCUMENT',
    });
  });

  it('verifies several quotes against one document', () => {
    const service = new QuoteVerifierService();
    const results = service.verifyMany('doc-a', CONTRACT_A, [
      'shall not exceed AED 100,000',
      'The liability of Alpha FZ-LLC',
      'this text is simply not present anywhere',
      'no',
    ]);

    expect(results.map((r) => r.status)).toEqual([
      'VERIFIED',
      'VERIFIED',
      'UNVERIFIED',
      'UNVERIFIED',
    ]);
    expect(results[3]).toEqual({ status: 'UNVERIFIED', reason: 'TOO_SHORT' });
  });

  it('returns one result per quote, in order', () => {
    const service = new QuoteVerifierService();
    const quotes = ['AED 100,000 in aggregate.', 'not in the document at all', 'of Alpha FZ-LLC'];
    const results = service.verifyMany('doc-a', CONTRACT_A, quotes);

    expect(results).toHaveLength(quotes.length);
  });

  it('handles an empty quote list', () => {
    const service = new QuoteVerifierService();
    expect(service.verifyMany('doc-a', CONTRACT_A, [])).toEqual([]);
  });
});

describe('QuoteVerifierService — the cache', () => {
  it('gives the same answer whether or not the document is cached', () => {
    const service = new QuoteVerifierService();
    const first = service.verify('doc-a', CONTRACT_A, 'AED 100,000 in aggregate');
    const second = service.verify('doc-a', CONTRACT_A, 'AED 100,000 in aggregate');

    expect(second).toEqual(first);
  });

  it('does not serve stale text if a document is reprocessed', () => {
    // Guards the one way a cache here could produce a WRONG verification rather than a slow
    // one: same id, different text.
    const service = new QuoteVerifierService();

    expect(service.verify('doc-x', 'The cap is AED 100,000.', 'cap is AED 100,000').status).toBe(
      'VERIFIED',
    );

    const reprocessed = 'The cap is AED 2,000,000 following amendment.';
    expect(service.verify('doc-x', reprocessed, 'cap is AED 100,000').status).toBe('UNVERIFIED');
    expect(service.verify('doc-x', reprocessed, 'cap is AED 2,000,000').status).toBe('VERIFIED');
  });

  it('still works after more documents than the cache holds', () => {
    const service = new QuoteVerifierService();

    // Push well past the capacity, then come back to the first document.
    for (let i = 0; i < 30; i += 1) {
      service.verify(`doc-${i}`, `Document ${i} says the fee is AED ${i}0,000 per month.`, 'the fee is');
    }

    const result = service.verify('doc-0', 'Document 0 says the fee is AED 00,000 per month.', 'the fee is AED 00,000');
    expect(result.status).toBe('VERIFIED');
  });

  it('can be invalidated explicitly', () => {
    const service = new QuoteVerifierService();
    service.verify('doc-a', CONTRACT_A, 'AED 100,000');
    service.invalidate('doc-a');

    // Still correct after the entry is dropped — it is a cache, not a source of truth.
    expect(service.verify('doc-a', CONTRACT_A, 'AED 100,000 in aggregate').status).toBe('VERIFIED');
  });

  it('invalidating a document that was never cached is harmless', () => {
    const service = new QuoteVerifierService();
    expect(() => service.invalidate('never-seen')).not.toThrow();
  });
});
