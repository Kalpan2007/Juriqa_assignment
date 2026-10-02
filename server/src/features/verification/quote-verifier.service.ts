import { Injectable, Logger } from '@nestjs/common';
import {
  findQuote,
  prepareDocument,
  type MatchKind,
  type PreparedDocument,
  type QuoteMatch,
  type RejectionReason,
} from './domain/quote-finder';

/**
 * The service every other feature uses to decide whether a quote is genuine
 * (ARCHITECTURE section 5).
 *
 * All the logic is in `domain/`; this adds two things a pure module cannot: the per-document
 * cache of normalised text, and the rule that a quote is only ever checked against the
 * document it was attributed to.
 */

export interface VerifiedQuote {
  status: 'VERIFIED';
  matchKind: MatchKind;
  matches: QuoteMatch[];
}

export interface UnverifiedQuote {
  status: 'UNVERIFIED';
  reason: RejectionReason | 'UNKNOWN_DOCUMENT';
}

export type VerificationResult = VerifiedQuote | UnverifiedQuote;

/**
 * How many documents' normalised forms to keep.
 *
 * Preparing a 150-page document costs real time, and an answer verifies several quotes
 * against the same document in a row, so the hit rate is high. Eight is enough for a
 * multi-document chat plus the document being read, and bounded so a long session cannot
 * grow memory without limit.
 */
const CACHE_CAPACITY = 8;

@Injectable()
export class QuoteVerifierService {
  private readonly logger = new Logger(QuoteVerifierService.name);

  /** Insertion-ordered, so the oldest key is the first one `keys()` yields. */
  private readonly cache = new Map<string, { prepared: PreparedDocument; textLength: number }>();

  /**
   * Verifies one quote against ONE document's text.
   *
   * `documentId` is only used for caching — the text passed in is what is searched. A caller
   * that resolves the wrong document's text would get a wrong answer, which is why multi-
   * document chat resolves the alias first and passes that document's text (section 9).
   */
  verify(documentId: string, fullText: string, quote: string): VerificationResult {
    const prepared = this.getPrepared(documentId, fullText);
    const result = findQuote(prepared, quote);

    if (!result.found) {
      return { status: 'UNVERIFIED', reason: result.reason };
    }
    return { status: 'VERIFIED', matchKind: result.kind, matches: result.matches };
  }

  /**
   * Verifies several quotes against the same document, preparing it once.
   * This is the path chat uses after an answer completes.
   */
  verifyMany(
    documentId: string,
    fullText: string,
    quotes: readonly string[],
  ): VerificationResult[] {
    const prepared = this.getPrepared(documentId, fullText);

    return quotes.map((quote) => {
      const result = findQuote(prepared, quote);
      return result.found
        ? { status: 'VERIFIED' as const, matchKind: result.kind, matches: result.matches }
        : { status: 'UNVERIFIED' as const, reason: result.reason };
    });
  }

  /** A quote attributed to a document that is not in this chat can never be verified. */
  unknownDocument(): UnverifiedQuote {
    return { status: 'UNVERIFIED', reason: 'UNKNOWN_DOCUMENT' };
  }

  /** Drops a document's cached text — called when it is deleted or reprocessed. */
  invalidate(documentId: string): void {
    this.cache.delete(documentId);
  }

  private getPrepared(documentId: string, fullText: string): PreparedDocument {
    const cached = this.cache.get(documentId);

    // The length check guards against serving stale text if a document is ever reprocessed
    // under the same id: a different length means the cached form cannot be right.
    if (cached !== undefined && cached.textLength === fullText.length) {
      // Re-insert so the most recently used key moves to the end.
      this.cache.delete(documentId);
      this.cache.set(documentId, cached);
      return cached.prepared;
    }

    const prepared = prepareDocument(fullText);
    this.cache.set(documentId, { prepared, textLength: fullText.length });

    if (this.cache.size > CACHE_CAPACITY) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) {
        this.cache.delete(oldest.value);
        this.logger.debug({ evicted: oldest.value }, 'Evicted a document from the verifier cache');
      }
    }

    return prepared;
  }
}
