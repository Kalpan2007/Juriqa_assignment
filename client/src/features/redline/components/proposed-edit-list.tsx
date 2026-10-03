'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import { redlineApi } from '../api';
import { useApplyRedline } from '../hooks/use-redline';
import type { RedlinePlanResponseDto } from '@ca/shared';

interface ProposedEditListProps {
  plan: RedlinePlanResponseDto;
}

export function ProposedEditList({ plan }: ProposedEditListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const applicableIds = plan.edits
      .filter((e) => e.status === 'APPLICABLE')
      .map((e) => e.id);
    return new Set(applicableIds);
  });

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const applyMutation = useApplyRedline();

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApply = async () => {
    setErrorMsg(null);
    try {
      const res = await applyMutation.mutateAsync({
        redlineId: plan.redlineId,
        acceptedEditIds: Array.from(selectedIds),
      });
      setDownloadUrl(redlineApi.downloadUrl(res.redlineId));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : copy.redline.selfCheckFailed);
    }
  };

  const applicableCount = plan.edits.filter((e) => e.status === 'APPLICABLE').length;

  return (
    <div className="space-y-6">
      <div className="p-6 bg-surface border border-border rounded-panel shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-fg">{copy.redline.proposed.title}</h2>
          <span className="text-caption text-fg-muted">
            {applicableCount} applicable · {plan.edits.length - applicableCount} rejected
          </span>
        </div>
        <p className="text-body-sm text-fg-muted">{copy.redline.proposed.description}</p>
      </div>

      <div className="space-y-4">
        {plan.edits.map((edit) => {
          const isApplicable = edit.status === 'APPLICABLE';
          const isChecked = selectedIds.has(edit.id);

          return (
            <div
              key={edit.id}
              className={`p-5 bg-surface border rounded-panel shadow-sm transition-all space-y-3 ${
                isApplicable ? 'border-border hover:border-border-hover' : 'border-danger-border/40 bg-danger-bg/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isApplicable ? (
                    <input
                      type="checkbox"
                      id={`edit-${edit.id}`}
                      checked={isChecked}
                      onChange={() => handleToggle(edit.id)}
                      disabled={applyMutation.isPending || Boolean(downloadUrl)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-accent"
                    />
                  ) : (
                    <span className="w-4 h-4 inline-flex items-center justify-center text-caption text-danger">✕</span>
                  )}
                  <Badge tone={isApplicable ? 'ready' : 'danger'}>
                    {edit.status}
                  </Badge>
                </div>

                {edit.clauseRef && (
                  <span className="text-caption text-fg-muted">
                    Clause {edit.clauseRef}
                  </span>
                )}
              </div>

              {/* Edit Details */}
              <div className="space-y-2 pt-1">
                {isApplicable ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-caption font-mono">
                    <div className="p-3 bg-danger-bg/20 border border-danger-border/30 rounded-input">
                      <div className="text-body-xs font-semibold text-danger mb-1 font-sans">
                        {copy.redline.proposed.find}
                      </div>
                      <div className="line-through text-fg whitespace-pre-wrap">{edit.find}</div>
                    </div>
                    <div className="p-3 bg-success-bg/20 border border-verified-border/30 rounded-input">
                      <div className="text-body-xs font-semibold text-status-ready mb-1 font-sans">
                        {copy.redline.proposed.replace}
                      </div>
                      <div className="text-fg whitespace-pre-wrap">{edit.replace}</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-danger-bg/10 border border-danger-border/20 rounded-input text-caption text-danger">
                    <span className="font-semibold">Rejection reason: </span>
                    <span>{edit.rejectionReason}</span>
                  </div>
                )}

                <div className="text-body-xs text-fg-muted">
                  <span className="font-medium text-fg">{copy.redline.proposed.reason}: </span>
                  {edit.reason}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <div className="p-4 bg-danger-bg border border-danger-border rounded-input text-body-sm text-danger">
          {errorMsg}
        </div>
      )}

      {downloadUrl ? (
        <div className="p-6 bg-surface border border-verified-border rounded-panel text-center space-y-3">
          <p className="text-body font-medium text-status-ready">
            ✓ Tracked changes applied successfully!
          </p>
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center justify-center px-4 py-2 text-body-sm font-medium rounded-input bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
          >
            {copy.redline.download}
          </a>
        </div>
      ) : (
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleApply}
            disabled={selectedIds.size === 0 || applyMutation.isPending}
          >
            {applyMutation.isPending ? copy.redline.applying : copy.redline.apply}
          </Button>
        </div>
      )}
    </div>
  );
}
