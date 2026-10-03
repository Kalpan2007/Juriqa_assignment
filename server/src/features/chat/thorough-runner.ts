import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { CoverageDto, SseEvent } from '@ca/shared';
import { AppError } from '../../core/errors/app-error';
import type { SseWriter } from '../../core/sse/sse-writer';
import { LlmService } from '../../infrastructure/llm/llm.service';
import { QuoteVerifierService } from '../verification/quote-verifier.service';
import type { SearchedChunk } from '../retrieval/retrieval.service';
import { buildCoverage } from '../retrieval/domain/coverage';
import {
  buildThoroughMapSystemPrompt,
  buildThoroughMapUserPrompt,
} from './prompts/thorough.prompt';

/**
 * Reads a whole document in batches (ARCHITECTURE section 6).
 *
 * This exists for one requirement: a 150-page contract cannot be answered from a single
 * request, and an app that reads only part of it must not answer as though it read all of it.
 * So every non-boilerplate section is scanned, and what happened is reported honestly —
 * including when the scan does NOT finish.
 *
 * The map phase reports findings; it never answers. A batch that answered would be answering
 * from a fraction of the document, which is precisely the failure this mode prevents.
 *
 * Quotes are verified DURING the map phase, so the reduce step is only ever offered sentences
 * that genuinely exist in the document.
 */

/** What each batch is asked to return. */
const mapResultSchema = z.object({
  relevant: z.boolean(),
  findings: z.string().default(''),
  quotes: z
    .array(z.object({ text: z.string().min(1) }))
    .default([])
    // A batch that dumps twenty quotes is not helping; keep the best few.
    .transform((quotes) => quotes.slice(0, 5)),
});

export interface ThoroughRunInput {
  documentId: string;
  documentName: string;
  fullText: string;
  question: string;
  batches: SearchedChunk[][];
  /** Every non-boilerplate chunk, for the coverage denominator. */
  totalChunks: number;
  pages: Array<{ number: number; startOffset: number; endOffset: number; isScanned: boolean }>;
  isPdf: boolean;
  signal: AbortSignal;
  writer: SseWriter<SseEvent>;
}

export interface ThoroughRunResult {
  /** Findings from the batches that reported something, in document order. */
  findings: string;
  /** Sentences confirmed to exist in the document. */
  verifiedQuotes: string[];
  /** Honest coverage: what was actually read, and why it stopped if it did. */
  coverage: CoverageDto;
  /** True when the user aborted mid-scan. */
  aborted: boolean;
}

/** Output allowance per batch. Generous because reasoning tokens are billed as output. */
const MAP_OUTPUT_TOKENS = 1_200;

/**
 * How many consecutive batch failures to tolerate before giving up.
 *
 * One batch failing is noise; three in a row means the provider is unavailable and continuing
 * would just produce a slow, mostly-empty scan. Stopping is reported as partial coverage
 * rather than presented as a complete read.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

@Injectable()
export class ThoroughRunner {
  private readonly logger = new Logger(ThoroughRunner.name);

  constructor(
    private readonly llm: LlmService,
    private readonly verifier: QuoteVerifierService,
  ) {}

  async run(input: ThoroughRunInput): Promise<ThoroughRunResult> {
    const { batches, writer, signal } = input;

    const findingParts: string[] = [];
    const verifiedQuotes: string[] = [];
    /** Chunks actually read — the numerator in coverage. */
    const readChunks: SearchedChunk[] = [];

    let stoppedEarlyReason: string | null = null;
    let consecutiveFailures = 0;
    let aborted = false;

    writer.send({
      type: 'progress',
      done: 0,
      total: batches.length,
      label: 'Reading the document',
    });

    for (const [index, batch] of batches.entries()) {
      if (signal.aborted) {
        aborted = true;
        stoppedEarlyReason = 'you stopped the answer';
        break;
      }

      try {
        const result = await this.llm.structured({
          purpose: 'chat.thorough.map',
          schema: mapResultSchema,
          maxOutputTokens: MAP_OUTPUT_TOKENS,
          signal,
          messages: [
            { role: 'system', content: buildThoroughMapSystemPrompt() },
            {
              role: 'user',
              content: buildThoroughMapUserPrompt({
                documentName: input.documentName,
                question: input.question,
                excerpts: renderBatch(batch),
                batchNumber: index + 1,
                batchTotal: batches.length,
              }),
            },
          ],
          onRetryNotice: (attempt, waitMs) => {
            writer.send({
              type: 'notice',
              code: 'LLM_RATE_LIMITED',
              message: `The AI service is busy. Waiting ${Math.ceil(waitMs / 1000)}s and retrying (attempt ${attempt})…`,
            });
          },
        });

        // The batch was read, whether or not it had anything to say. That is what makes the
        // coverage count honest.
        readChunks.push(...batch);
        consecutiveFailures = 0;

        if (result.relevant && result.findings.trim().length > 0) {
          const label = describeBatch(batch);
          findingParts.push(`### ${label}\n${result.findings.trim()}`);
        }

        // Verify now, so the reduce step is only ever offered real sentences.
        if (result.quotes.length > 0) {
          const outcomes = this.verifier.verifyMany(
            input.documentId,
            input.fullText,
            result.quotes.map((quote) => quote.text),
          );
          outcomes.forEach((outcome, quoteIndex) => {
            const text = result.quotes[quoteIndex]?.text;
            if (outcome.status === 'VERIFIED' && text !== undefined) {
              verifiedQuotes.push(text);
            }
          });
        }
      } catch (error) {
        if (signal.aborted) {
          aborted = true;
          stoppedEarlyReason = 'you stopped the answer';
          break;
        }

        consecutiveFailures += 1;
        this.logger.warn(
          { err: error, batch: index + 1, of: batches.length, consecutiveFailures },
          'A batch of the thorough scan failed',
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stoppedEarlyReason = 'the AI service was unavailable';
          break;
        }
        // Skip this batch and carry on. It is NOT added to readChunks, so coverage reflects
        // that part of the document was never seen.
      }

      writer.send({
        type: 'progress',
        done: index + 1,
        total: batches.length,
        label: 'Reading the document',
      });
    }

    const effectiveStoppedEarlyReason =
      stoppedEarlyReason ??
      (readChunks.length < input.totalChunks ? 'the AI service was unavailable' : null);

    const coverage = buildCoverage({
      mode: 'THOROUGH',
      readChunks,
      totalChunks: input.totalChunks,
      pages: input.pages,
      isPdf: input.isPdf,
      stoppedEarlyReason: effectiveStoppedEarlyReason,
    });

    this.logger.log(
      {
        documentId: input.documentId,
        batches: batches.length,
        chunksRead: readChunks.length,
        chunksTotal: input.totalChunks,
        complete: coverage.complete,
        verifiedQuotes: verifiedQuotes.length,
        stoppedEarlyReason,
      },
      'Thorough scan finished',
    );

    return {
      findings: findingParts.join('\n\n'),
      // The same sentence found in two batches is one piece of evidence, not two.
      verifiedQuotes: [...new Set(verifiedQuotes)],
      coverage,
      aborted,
    };
  }

  /** A scan that read nothing at all cannot support an answer. */
  assertUsable(result: ThoroughRunResult): void {
    if (result.coverage.chunksRead === 0 && !result.aborted) {
      throw new AppError(
        'LLM_UNAVAILABLE',
        503,
        'The document could not be read because the AI service was unavailable. Please try again.',
      );
    }
  }
}

function renderBatch(batch: readonly SearchedChunk[]): string {
  return batch
    .map((chunk) => {
      const label =
        [chunk.clauseRef, chunk.heading].filter(Boolean).join(' ') || `Section ${chunk.ordinal + 1}`;
      return `### ${label}\n${chunk.text}`;
    })
    .join('\n\n');
}

/** A human label for where a finding came from, used in the reduce prompt. */
function describeBatch(batch: readonly SearchedChunk[]): string {
  const first = batch[0];
  const last = batch[batch.length - 1];
  if (first === undefined) return 'Unknown section';

  const label = (chunk: SearchedChunk): string =>
    chunk.clauseRef ?? chunk.heading ?? `Section ${chunk.ordinal + 1}`;

  if (last === undefined || first === last) return label(first);
  return `${label(first)} to ${label(last)}`;
}
