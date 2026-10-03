'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { copy } from '@/content/copy';
import type { ComparisonResultDto, ComparisonChangeDto, ChangeType, Severity } from '@ca/shared';

interface ChangeListProps {
  comparison: ComparisonResultDto;
}

export function ChangeList({ comparison }: ChangeListProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'sideBySide' | 'inline'>('sideBySide');

  const { counts, renumberNote, differentContractsWarning, changes } = comparison;

  // Filter changes
  const filteredChanges = changes.filter((c) => {
    if (selectedSeverity !== 'ALL' && c.severity !== selectedSeverity) return false;
    if (selectedType !== 'ALL' && c.type !== selectedType) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Overview Card */}
      <div className="p-6 bg-surface border border-border rounded-panel shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-caption text-fg-muted">
              <span>{comparison.baseDocumentName}</span>
              <span>→</span>
              <span>{comparison.revisedDocumentName}</span>
            </div>
            <h1 className="text-h2 font-bold text-fg mt-1">{copy.compare.summary.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="danger" className="text-body-xs font-semibold px-2.5 py-1">
              {counts.high} High
            </Badge>
            <Badge tone="processing" className="text-body-xs font-semibold px-2.5 py-1">
              {counts.medium} Medium
            </Badge>
            <Badge tone="neutral" className="text-body-xs font-semibold px-2.5 py-1">
              {counts.low} Low
            </Badge>
          </div>
        </div>

        {renumberNote && (
          <div className="p-3 bg-surface-muted border border-border rounded-input text-body-sm text-fg-muted flex items-start gap-2">
            <span className="font-semibold text-fg">ℹ Note:</span>
            <span>{renumberNote}</span>
          </div>
        )}

        {differentContractsWarning && (
          <div className="p-3 bg-danger-bg border border-danger-border rounded-input text-body-sm text-danger flex items-start gap-2">
            <span className="font-semibold">⚠ Warning:</span>
            <span>{copy.compare.differentContracts}</span>
          </div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface border border-border rounded-panel">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-severity" className="text-caption font-medium text-fg-muted">
              {copy.compare.filters.severity}:
            </label>
            <select
              id="filter-severity"
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="h-8 px-2 text-caption bg-surface border border-border rounded-input text-fg"
            >
              <option value="ALL">All ({changes.length})</option>
              <option value="HIGH">High ({counts.high})</option>
              <option value="MEDIUM">Medium ({counts.medium})</option>
              <option value="LOW">Low ({counts.low})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-type" className="text-caption font-medium text-fg-muted">
              {copy.compare.filters.type}:
            </label>
            <select
              id="filter-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-8 px-2 text-caption bg-surface border border-border rounded-input text-fg"
            >
              <option value="ALL">All</option>
              <option value="MODIFIED">Changed</option>
              <option value="ADDED">Added</option>
              <option value="REMOVED">Removed</option>
              <option value="MOVED">Moved</option>
              <option value="UNCHANGED">Unchanged</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1 border border-border rounded-input p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('sideBySide')}
            className={`px-3 py-1 text-caption rounded-input transition-colors ${
              viewMode === 'sideBySide'
                ? 'bg-primary text-primary-fg font-medium'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {copy.compare.sideBySide}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('inline')}
            className={`px-3 py-1 text-caption rounded-input transition-colors ${
              viewMode === 'inline'
                ? 'bg-primary text-primary-fg font-medium'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {copy.compare.inlineDiff}
          </button>
        </div>
      </div>

      {/* Changes List */}
      {filteredChanges.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-border rounded-panel text-fg-muted">
          No changes match the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredChanges.map((change, index) => (
            <ChangeCard
              key={`change-${index}`}
              change={change}
              viewMode={viewMode}
              baseDocId={comparison.baseDocumentId}
              revisedDocId={comparison.revisedDocumentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  viewMode,
  baseDocId,
  revisedDocId,
}: {
  change: ComparisonChangeDto;
  viewMode: 'sideBySide' | 'inline';
  baseDocId: string;
  revisedDocId: string;
}) {
  const severityTone: Record<Severity, BadgeTone> = {
    HIGH: 'danger',
    MEDIUM: 'processing',
    LOW: 'neutral',
  };

  const typeTone: Record<ChangeType, BadgeTone> = {
    ADDED: 'ready',
    REMOVED: 'danger',
    MODIFIED: 'verified',
    MOVED: 'processing',
    UNCHANGED: 'neutral',
  };

  const title =
    change.revisedClause?.title ||
    change.baseClause?.title ||
    `Clause ${change.revisedClause?.ref || change.baseClause?.ref || ''}`;

  const baseRef = change.baseClause?.ref ? `Clause ${change.baseClause.ref}` : null;
  const revRef = change.revisedClause?.ref ? `Clause ${change.revisedClause.ref}` : null;

  return (
    <div className="p-5 bg-surface border border-border rounded-panel shadow-sm space-y-4 transition-all hover:border-border-hover">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone={typeTone[change.type]}>{change.type}</Badge>
            <Badge tone={severityTone[change.severity]}>{change.severity}</Badge>
            <h3 className="text-body font-semibold text-fg">{title}</h3>
          </div>
          {(baseRef || revRef) && (
            <p className="text-caption text-fg-muted">
              {baseRef && <span>Original: {baseRef}</span>}
              {baseRef && revRef && <span className="mx-2">·</span>}
              {revRef && <span>Revised: {revRef}</span>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 text-caption">
          {change.baseClause && (
            <Link
              href={`/documents/${baseDocId}`}
              className="text-primary hover:underline"
              target="_blank"
            >
              {copy.compare.openInBase} ↗
            </Link>
          )}
          {change.revisedClause && (
            <Link
              href={`/documents/${revisedDocId}`}
              className="text-primary hover:underline"
              target="_blank"
            >
              {copy.compare.openInRevised} ↗
            </Link>
          )}
        </div>
      </div>

      {/* Summary / Detector Pills */}
      <div className="space-y-2">
        <p className="text-body-sm text-fg font-medium">{change.summary}</p>

        {change.detectorReasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {change.detectorReasons.map((reason, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded text-caption bg-surface-muted border border-border text-fg-muted"
              >
                {reason}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Diff View */}
      {change.type !== 'UNCHANGED' && (
        <div className="pt-2">
          {viewMode === 'sideBySide' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-caption font-mono">
              <div className="p-3 bg-danger-bg/20 border border-danger-border/30 rounded-input overflow-x-auto max-h-60">
                <div className="text-body-xs font-semibold text-danger mb-1 font-sans">
                  Original ({change.baseClause ? 'Present' : 'Not in original'})
                </div>
                <div className="whitespace-pre-wrap text-fg">
                  {change.baseClause?.body || <span className="text-fg-muted italic">None</span>}
                </div>
              </div>
              <div className="p-3 bg-success-bg/20 border border-verified-border/30 rounded-input overflow-x-auto max-h-60">
                <div className="text-body-xs font-semibold text-status-ready mb-1 font-sans">
                  Revised ({change.revisedClause ? 'Present' : 'Deleted'})
                </div>
                <div className="whitespace-pre-wrap text-fg">
                  {change.revisedClause?.body || <span className="text-fg-muted italic">None</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-surface-muted border border-border rounded-input text-caption font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
              {change.type === 'ADDED' && (
                <div className="text-status-ready">
                  + {change.revisedClause?.body}
                </div>
              )}
              {change.type === 'REMOVED' && (
                <div className="text-danger line-through">
                  - {change.baseClause?.body}
                </div>
              )}
              {change.type === 'MODIFIED' && (
                <div className="space-y-2">
                  <div className="text-danger line-through">
                    - {change.baseClause?.body}
                  </div>
                  <div className="text-status-ready">
                    + {change.revisedClause?.body}
                  </div>
                </div>
              )}
              {change.type === 'MOVED' && (
                <div className="text-status-processing">
                  ~ Moved to new position:
                  <div className="mt-1 text-fg">{change.revisedClause?.body}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
