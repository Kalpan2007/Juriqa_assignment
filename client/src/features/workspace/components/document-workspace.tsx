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
import { DocumentViewer } from '@/features/viewer';

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
    <div className="flex min-h-0 flex-col space-y-3">
      {/* Workspace Executive Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-fg-muted hover:text-fg">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Documents
            </Link>
          </Button>

          <div className="h-4 w-px bg-border" />

          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <h1 className="truncate text-body font-semibold text-fg">{document.name}</h1>
            <span className="rounded bg-surface-muted px-2 py-0.5 text-micro font-medium text-fg-subtle border border-border">
              {document.pageCount ? `${document.pageCount} pgs` : document.kind}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="h-8 gap-1.5 text-caption border-border">
            <Link href={`/compare?base=${documentId}`}>
              <span>⚖️ Compare Contract</span>
            </Link>
          </Button>

          {document.kind === 'DOCX' && (
            <Button asChild variant="secondary" size="sm" className="h-8 gap-1.5 text-caption border-border">
              <Link href={`/redline?documentId=${documentId}`}>
                <span>📝 Redline (.docx)</span>
              </Link>
            </Button>
          )}

          <DocumentStatusBadge
            status={document.status}
            statusDetail={document.statusDetail}
            errorMessage={document.errorMessage}
          />
        </div>
      </header>

      <DocumentWarnings documentId={documentId} enabled={document.status === 'READY'} />

      <SplitPane
        left={
          <DocumentViewer
            documentId={documentId}
            kind={document.kind}
            activeQuote={activeQuote}
            onClearQuote={() => setActiveQuote(null)}
          />
        }
        right={<ChatPanel documentId={documentId} onOpenQuote={setActiveQuote} />}
      />
    </div>
  );
}

