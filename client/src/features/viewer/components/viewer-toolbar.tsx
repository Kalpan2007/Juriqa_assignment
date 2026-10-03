'use client';

import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

export interface ViewerToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  occurrenceIndex: number;
  occurrencesTotal: number;
  onPrevOccurrence: () => void;
  onNextOccurrence: () => void;
  hasActiveHighlight: boolean;
  onClearHighlight: () => void;
}

export function ViewerToolbar({
  currentPage,
  totalPages,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  occurrenceIndex,
  occurrencesTotal,
  onPrevOccurrence,
  onNextOccurrence,
  hasActiveHighlight,
  onClearHighlight,
}: ViewerToolbarProps) {
  const percent = Math.round(scale * 100);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-surface px-3 py-2 text-small">
      {/* Left: Page counter */}
      <div className="flex items-center gap-2 text-caption text-fg-muted font-medium">
        <span>
          {copy.viewer.pageOf
            .replace('{number}', String(currentPage))
            .replace('{total}', String(totalPages))}
        </span>
      </div>

      {/* Center: Occurrence Navigator (when quote has matches) */}
      {hasActiveHighlight && occurrencesTotal > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border border-highlight-border bg-highlight/20 px-2 py-1 text-caption text-fg">
          <span className="font-medium text-fg">
            Match {occurrenceIndex + 1} of {occurrencesTotal}
          </span>
          {occurrencesTotal > 1 && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onPrevOccurrence}
                aria-label={copy.viewer.previousOccurrence}
                title={copy.viewer.previousOccurrence}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onNextOccurrence}
                aria-label={copy.viewer.nextOccurrence}
                title={copy.viewer.nextOccurrence}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-fg-muted hover:text-fg"
            onClick={onClearHighlight}
            aria-label={copy.viewer.clearHighlight}
            title={copy.viewer.clearHighlight}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Right: Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onZoomOut}
          disabled={scale <= 0.6}
          aria-label={copy.viewer.zoomOut}
          title={copy.viewer.zoomOut}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <button
          type="button"
          onClick={onZoomReset}
          className="w-12 text-center font-mono text-caption text-fg-muted hover:text-fg transition-colors"
          title={copy.viewer.zoomReset}
        >
          {percent}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onZoomIn}
          disabled={scale >= 2.0}
          aria-label={copy.viewer.zoomIn}
          title={copy.viewer.zoomIn}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        {scale !== 1.0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onZoomReset}
            aria-label={copy.viewer.zoomReset}
            title={copy.viewer.zoomReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
