'use client';

import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextRange } from '@ca/shared';
import { copy } from '@/content/copy';
import { computeHighlightRects, type ItemGeometry, type HighlightRect } from '../lib/highlight-geometry';

export interface PdfPageProps {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  width: number;
  height: number;
  isScanned: boolean;
  scale: number;
  items: ItemGeometry[];
  highlightRange?: TextRange | null;
  isActivePage?: boolean;
}

export function PdfPage({
  pdfDoc,
  pageNumber,
  width,
  height,
  isScanned,
  scale,
  items,
  highlightRange,
  isActivePage,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  // Render PDF page to canvas
  useEffect(() => {
    const activeDoc = pdfDoc;
    if (!activeDoc || !canvasRef.current) return;

    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;

    async function renderPage() {
      if (!activeDoc || !canvasRef.current) return;
      try {
        page = await activeDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // High DPI support
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.round(scaledWidth * pixelRatio);
        canvas.height = Math.round(scaledHeight * pixelRatio);
        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const viewport = page.getViewport({ scale });
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });

        await renderTask.promise;
      } catch (err: unknown) {
        const isCancelled =
          typeof err === 'object' && err !== null && 'name' in err && err.name === 'RenderingCancelledException';
        if (!isCancelled && !cancelled) {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
      if (page) {
        page.cleanup();
      }
    };
  }, [pdfDoc, pageNumber, scale, scaledWidth, scaledHeight]);

  // Compute highlight rectangles if this page has an active highlight
  const highlightRects: HighlightRect[] =
    highlightRange && items.length > 0
      ? computeHighlightRects(highlightRange, items, height, scale)
      : [];

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      data-page-number={pageNumber}
      className={`relative mx-auto my-4 bg-white shadow-md transition-shadow ${
        isActivePage ? 'ring-2 ring-highlight-border' : ''
      }`}
      style={{
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
      }}
    >
      {/* Canvas page rendering */}
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Scanned page indicator overlay */}
      {isScanned && (
        <div className="absolute top-2 left-2 right-2 rounded bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-caption text-amber-700">
          {copy.viewer.scannedPage}
        </div>
      )}

      {/* Highlight rectangles */}
      {highlightRects.map((rect, index) => (
        <div
          key={index}
          className="absolute bg-highlight/35 border-b-2 border-highlight-border rounded-xs pointer-events-none transition-all duration-300 animate-pulse"
          style={{
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
        />
      ))}

      {/* Page number watermark at bottom center */}
      <div className="absolute bottom-1 right-2 text-caption text-fg-subtle font-mono select-none">
        {pageNumber}
      </div>
    </div>
  );
}
