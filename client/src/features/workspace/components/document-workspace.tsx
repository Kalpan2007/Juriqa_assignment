'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import type { QuoteDto } from '@ca/shared';
import { ErrorState, LoadingState } from '@/components/feedback';
import { SplitPane } from '@/components/layout/split-pane';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { copy } from '@/content/copy';
import { useDocument, DocumentStatusBadge, DocumentWarnings } from '@/features/library';
import { ChatPanel } from '@/features/chat';

/**
 * The document workspace: the document on the left, chat on the right.
 *
 * This is the one screen that composes two features, which is why it is its own feature
 * rather than logic in the route file (CLAUDE.md: `app/` is routing only).
 *
 * The left pane is a placeholder until slice F5 brings the real pdf.js viewer. It already
 * accepts the quote a user clicked, so wiring the viewer in is a change in one place.
 */
export function DocumentWorkspace({ documentId }: { documentId: string }) {
  const { data: document, isPending, isError, error, refetch } = useDocument(documentId);
  const [activeQuote, setActiveQuote] = useState<QuoteDto | null>(null);

  if (isPending) return <LoadingState message={copy.viewer.loading} />;

  if (isError) {
    return (
      <ErrorState
        code={ApiError.isApiError(error) ? error.code : undefined}
        serverMessage={ApiError.isApiError(error) ? error.serverMessage : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.nav.library}
            </Link>
          </Button>
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <h1 className="truncate text-h3 text-fg">{document.name}</h1>
          </span>
        </div>
        <DocumentStatusBadge
          status={document.status}
          statusDetail={document.statusDetail}
          errorMessage={document.errorMessage}
        />
      </header>

      <DocumentWarnings documentId={documentId} enabled={document.status === 'READY'} />

      <SplitPane
        left={<ViewerPlaceholder activeQuote={activeQuote} />}
        right={<ChatPanel documentId={documentId} onOpenQuote={setActiveQuote} />}
      />
    </div>
  );
}

/**
 * Stands in for the viewer until slice F5.
 *
 * It deliberately shows the quote the user clicked and the offsets we found, so the chain
 * from answer to verified quote to document position is visible and testable before the
 * pdf.js renderer exists.
 */
function ViewerPlaceholder({ activeQuote }: { activeQuote: QuoteDto | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileText className="h-6 w-6 text-fg-subtle" aria-hidden="true" />
      <p className="text-small text-fg-muted">{copy.viewer.title}</p>

      {activeQuote === null ? (
        <p className="max-w-prose text-caption text-fg-subtle">
          {copy.chat.quote.verifiedHint}
        </p>
      ) : (
        <div className="max-w-prose rounded-md border border-highlight-border bg-highlight px-3 py-2 text-left">
          <p className="text-small text-fg">{activeQuote.text}</p>
          <p className="mt-1 font-mono text-caption text-fg-muted">
            {activeQuote.matches.map((match) => `${match.start}–${match.end}`).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
