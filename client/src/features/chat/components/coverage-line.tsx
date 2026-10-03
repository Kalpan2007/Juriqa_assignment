'use client';

import { AlertTriangle, BookOpen } from 'lucide-react';
import { needsCoverageWarning, type CoverageDto, type DocumentCoverageDto } from '@ca/shared';
import { copy, format } from '@/content/copy';

/**
 * What the app actually read, under every answer (ARCHITECTURE section 6).
 *
 * This is never hidden and never collapsed. The assignment's hardest requirement is that an
 * app which read part of a document must not answer as though it read all of it — and a
 * coverage line the user has to go looking for does not satisfy that.
 *
 * The warning chip is the second half: when an answer CLAIMS something is absent but the
 * whole document was not read, the claim is shown next to the fact that it is based on part
 * of the document. That check is in `@ca/shared` so the server and the UI agree on what
 * counts as an absence claim.
 */
export function CoverageLine({
  coverage,
  documentCoverage,
  answerText,
}: {
  coverage: CoverageDto | null;
  documentCoverage?: DocumentCoverageDto[];
  answerText: string;
}) {
  if (documentCoverage && documentCoverage.length > 0) {
    return (
      <div className="mt-2 flex flex-col gap-1.5 text-caption text-fg-muted">
        {documentCoverage.map((doc) => {
          const showWarning = needsCoverageWarning(answerText, doc.coverage);
          return (
            <div key={doc.documentId} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-fg">
                {doc.alias}: {doc.documentName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                {describeCoverage(doc.coverage)}
              </span>

              {showWarning && (
                <span className="inline-flex items-center gap-1 rounded-pill border border-unverified-border bg-unverified-bg px-2 py-0.5 text-unverified">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {format(copy.chat.coverage.basedOnPartial, {
                    read: doc.coverage.chunksRead,
                    total: doc.coverage.chunksTotal,
                  })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (coverage === null) return null;

  const showWarning = needsCoverageWarning(answerText, coverage);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        {describeCoverage(coverage)}
      </span>

      {showWarning && (
        <span className="inline-flex items-center gap-1 rounded-pill border border-unverified-border bg-unverified-bg px-2 py-0.5 text-unverified">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {format(copy.chat.coverage.basedOnPartial, {
            read: coverage.chunksRead,
            total: coverage.chunksTotal,
          })}
        </span>
      )}
    </div>
  );
}

/**
 * Turns coverage into a sentence.
 *
 * Every branch here is a different honest statement, and the order matters: a run that
 * stopped early is reported as such even if it read everything it managed to, and a document
 * with unreadable pages is never described as fully read.
 */
export function describeCoverage(coverage: CoverageDto): string {
  if (coverage.stoppedEarlyReason !== null) {
    return format(copy.chat.coverage.stoppedEarly, {
      read: coverage.chunksRead,
      total: coverage.chunksTotal,
    });
  }

  const readEverything = coverage.chunksTotal > 0 && coverage.chunksRead >= coverage.chunksTotal;

  if (readEverything && coverage.skippedPages.length > 0) {
    // Read every section, but some pages had no text at all — so not "the whole document".
    return format(copy.chat.coverage.exceptScanned, {
      pages: coverage.skippedPages.join(', '),
    });
  }

  if (coverage.complete) return copy.chat.coverage.whole;

  // Pages are only meaningful for a PDF (decision D13).
  if (coverage.pagesCovered !== null && coverage.pagesCovered.length > 0) {
    return format(copy.chat.coverage.withPages, {
      read: coverage.chunksRead,
      total: coverage.chunksTotal,
      pages: coverage.pagesCovered.join(', '),
    });
  }

  if (coverage.sectionsCovered.length > 0 && coverage.sectionsCovered.length <= 6) {
    return format(copy.chat.coverage.withSections, {
      read: coverage.chunksRead,
      total: coverage.chunksTotal,
      sections: coverage.sectionsCovered.join(', '),
    });
  }

  return format(copy.chat.coverage.partial, {
    read: coverage.chunksRead,
    total: coverage.chunksTotal,
  });
}
