'use client';

import { useState, useEffect } from 'react';
import type { QuoteDto } from '@ca/shared';
import { PdfViewer } from './pdf-viewer';
import { DocxViewer } from './docx-viewer';

export interface DocumentViewerProps {
  documentId: string;
  kind: 'PDF' | 'DOCX';
  activeQuote: QuoteDto | null;
  onClearQuote: () => void;
}

export function DocumentViewer({
  documentId,
  kind,
  activeQuote,
  onClearQuote,
}: DocumentViewerProps) {
  const [occurrenceIndex, setOccurrenceIndex] = useState(0);

  // Reset occurrence index when activeQuote changes
  useEffect(() => {
    setOccurrenceIndex(0);
  }, [activeQuote]);

  const matchesCount = activeQuote?.matches?.length ?? 0;

  const handlePrevOccurrence = () => {
    if (matchesCount <= 1) return;
    setOccurrenceIndex((current) => (current > 0 ? current - 1 : matchesCount - 1));
  };

  const handleNextOccurrence = () => {
    if (matchesCount <= 1) return;
    setOccurrenceIndex((current) => (current < matchesCount - 1 ? current + 1 : 0));
  };

  if (kind === 'PDF') {
    return (
      <PdfViewer
        documentId={documentId}
        activeQuote={activeQuote}
        occurrenceIndex={occurrenceIndex}
        onPrevOccurrence={handlePrevOccurrence}
        onNextOccurrence={handleNextOccurrence}
        onClearQuote={onClearQuote}
      />
    );
  }

  return (
    <DocxViewer
      documentId={documentId}
      activeQuote={activeQuote}
      occurrenceIndex={occurrenceIndex}
      onPrevOccurrence={handlePrevOccurrence}
      onNextOccurrence={handleNextOccurrence}
      onClearQuote={onClearQuote}
    />
  );
}
