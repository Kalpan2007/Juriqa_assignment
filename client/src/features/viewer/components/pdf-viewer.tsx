'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { splitRangeByPage, type TextRange, type QuoteDto } from '@ca/shared';
import { LoadingState, ErrorState } from '@/components/feedback';
import { copy } from '@/content/copy';
import { libraryApi } from '@/features/library';
import { useDocumentLayout, useDocumentPages } from '../hooks/use-viewer-data';
import { ViewerToolbar } from './viewer-toolbar';
import { PdfPage } from './pdf-page';
import type { ItemGeometry } from '../lib/highlight-geometry';

export interface PdfViewerProps {
  documentId: string;
  activeQuote: QuoteDto | null;
  occurrenceIndex: number;
  onPrevOccurrence: () => void;
  onNextOccurrence: () => void;
  onClearQuote: () => void;
}

export function PdfViewer({
  documentId,
  activeQuote,
  occurrenceIndex,
  onPrevOccurrence,
  onNextOccurrence,
  onClearQuote,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data: layout, isPending: layoutPending, isError: layoutError } = useDocumentLayout(documentId);

  // Load PDF via pdf.js
  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      try {
        setLoadingPdf(true);
        setPdfError(null);

        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

        const loadingTask = pdfjs.getDocument({
          url: libraryApi.fileUrl(documentId),
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setLoadingPdf(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load PDF with pdf.js:', err);
          const message = err instanceof Error ? err.message : 'Could not load PDF document.';
          setPdfError(message);
          setLoadingPdf(false);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Determine active match range
  const activeMatch = useMemo(() => {
    if (!activeQuote || !activeQuote.matches || activeQuote.matches.length === 0) return null;
    return activeQuote.matches[occurrenceIndex] ?? activeQuote.matches[0];
  }, [activeQuote, occurrenceIndex]);

  // Split active match across pages
  const pageSegments = useMemo(() => {
    if (!activeMatch || !layout?.pages) return [];
    return splitRangeByPage(
      { start: activeMatch.start, end: activeMatch.end },
      layout.pages.map((p) => ({
        pageNumber: p.number,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
      })),
    );
  }, [activeMatch, layout?.pages]);

  // First page of active match
  const targetPageNumber = pageSegments[0]?.pageNumber;

  // Window of pages to fetch item geometry for
  const fetchWindow = useMemo(() => {
    const center = targetPageNumber ?? currentPage;
    const total = layout?.pages.length ?? 1;
    const from = Math.max(1, center - 2);
    const to = Math.min(total, center + 2);
    return { from, to };
  }, [targetPageNumber, currentPage, layout?.pages.length]);

  const { data: pagesData } = useDocumentPages(
    documentId,
    fetchWindow.from,
    fetchWindow.to,
    Boolean(layout),
  );

  // Map of page items
  const itemsByPage = useMemo(() => {
    const map = new Map<number, ItemGeometry[]>();
    if (!pagesData?.pages) return map;

    for (const p of pagesData.pages) {
      // items array format: [start, end, x, y, width, height, hasEol]
      const items: ItemGeometry[] = p.items.map((item) => ({
        start: item[0],
        end: item[1],
        x: item[2],
        y: item[3],
        width: item[4],
        height: item[5],
      }));
      map.set(p.number, items);
    }
    return map;
  }, [pagesData?.pages]);

  // Scroll to active quote target page when changed
  useEffect(() => {
    if (!targetPageNumber) return;

    setCurrentPage(targetPageNumber);
    const timer = setTimeout(() => {
      const pageEl = document.getElementById(`pdf-page-${targetPageNumber}`);
      if (pageEl && containerRef.current) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [targetPageNumber, activeMatch]);

  // Update current page on scroll
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !layout?.pages) return;

    const containerTop = container.scrollTop;
    const pageElements = container.querySelectorAll('[data-page-number]');

    for (const el of Array.from(pageElements)) {
      const pageNum = Number(el.getAttribute('data-page-number'));
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetTop <= containerTop + container.clientHeight / 3) {
        setCurrentPage(pageNum);
      }
    }
  };

  if (layoutPending || loadingPdf) {
    return <LoadingState message={copy.viewer.loading} />;
  }

  if (layoutError || pdfError) {
    return (
      <ErrorState
        code="VIEWER_ERROR"
        serverMessage={pdfError || copy.viewer.error.description}
      />
    );
  }

  const pages = layout?.pages ?? [];
  const totalPages = pages.length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-canvas">
      {/* Viewer Toolbar */}
      <ViewerToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        onZoomIn={() => setScale((s) => Math.min(2.0, Number((s + 0.15).toFixed(2))))}
        onZoomOut={() => setScale((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))))}
        onZoomReset={() => setScale(1.0)}
        occurrenceIndex={occurrenceIndex}
        occurrencesTotal={activeQuote?.matches.length ?? 0}
        onPrevOccurrence={onPrevOccurrence}
        onNextOccurrence={onNextOccurrence}
        hasActiveHighlight={Boolean(activeQuote)}
        onClearHighlight={onClearQuote}
      />

      {/* Pages Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-auto p-4 select-text"
      >
        {pages.map((page) => {
          // Check if this page has a segment of the active highlight
          const segment = pageSegments.find((s) => s.pageNumber === page.number);
          const highlightRange: TextRange | null = segment
            ? { start: segment.start, end: segment.end }
            : null;

          return (
            <PdfPage
              key={page.number}
              pdfDoc={pdfDoc}
              pageNumber={page.number}
              width={page.width ?? 612}
              height={page.height ?? 792}
              isScanned={page.isScanned}
              scale={scale}
              items={itemsByPage.get(page.number) ?? []}
              highlightRange={highlightRange}
              isActivePage={page.number === targetPageNumber}
            />
          );
        })}
      </div>
    </div>
  );
}
