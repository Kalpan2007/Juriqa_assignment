'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { QuoteDto } from '@ca/shared';
import { LoadingState, ErrorState } from '@/components/feedback';
import { copy } from '@/content/copy';
import { useDocumentHtml } from '../hooks/use-viewer-data';
import { ViewerToolbar } from './viewer-toolbar';

export interface DocxViewerProps {
  documentId: string;
  activeQuote: QuoteDto | null;
  occurrenceIndex: number;
  onPrevOccurrence: () => void;
  onNextOccurrence: () => void;
  onClearQuote: () => void;
}

export function DocxViewer({
  documentId,
  activeQuote,
  occurrenceIndex,
  onPrevOccurrence,
  onNextOccurrence,
  onClearQuote,
}: DocxViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { data: htmlData, isPending, isError, error } = useDocumentHtml(documentId);

  // Active match
  const activeMatch = useMemo(() => {
    if (!activeQuote || !activeQuote.matches || activeQuote.matches.length === 0) return null;
    return activeQuote.matches[occurrenceIndex] ?? activeQuote.matches[0];
  }, [activeQuote, occurrenceIndex]);

  // When activeMatch changes, scroll the matching block into view and highlight it
  useEffect(() => {
    if (!containerRef.current || !activeMatch) return;

    const container = containerRef.current;

    // Clear previous highlights
    const prevHighlighted = container.querySelectorAll('.docx-highlight-active');
    prevHighlighted.forEach((el) => {
      el.classList.remove(
        'docx-highlight-active',
        'bg-highlight/30',
        'border-l-4',
        'border-highlight-border',
        'pl-2',
        'rounded-r',
        'transition-all',
      );
    });

    // Find block elements with data-start and data-end
    const blocks = container.querySelectorAll<HTMLElement>('[data-start][data-end]');
    let targetEl: HTMLElement | null = null;

    for (const block of Array.from(blocks)) {
      const bStart = Number(block.getAttribute('data-start'));
      const bEnd = Number(block.getAttribute('data-end'));

      if (bStart < activeMatch.end && bEnd > activeMatch.start) {
        targetEl = block;
        block.classList.add(
          'docx-highlight-active',
          'bg-highlight/30',
          'border-l-4',
          'border-highlight-border',
          'pl-2',
          'rounded-r',
          'transition-all',
        );
      }
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatch]);

  if (isPending) {
    return <LoadingState message={copy.viewer.loading} />;
  }

  if (isError) {
    return (
      <ErrorState
        code="DOCX_ERROR"
        serverMessage={error instanceof Error ? error.message : copy.viewer.error.description}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-canvas">
      {/* Viewer Toolbar */}
      <ViewerToolbar
        currentPage={1}
        totalPages={1}
        scale={1.0}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        occurrenceIndex={occurrenceIndex}
        occurrencesTotal={activeQuote?.matches.length ?? 0}
        onPrevOccurrence={onPrevOccurrence}
        onNextOccurrence={onNextOccurrence}
        hasActiveHighlight={Boolean(activeQuote)}
        onClearHighlight={onClearQuote}
      />

      {/* Styled DOCX Reading View */}
      <div className="flex-1 overflow-y-auto p-8">
        <div
          ref={containerRef}
          className="mx-auto max-w-3xl rounded-lg border border-border bg-white p-10 shadow-sm prose prose-slate dark:prose-invert select-text"
          dangerouslySetInnerHTML={{ __html: htmlData?.html ?? '' }}
        />
      </div>
    </div>
  );
}
