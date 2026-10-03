'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { useDocument } from '@/features/library';
import {
  InstructionForm,
  ProposedEditList,
  useCreateRedlinePlan,
} from '@/features/redline';
import { copy } from '@/content/copy';
import type { RedlinePlanResponseDto } from '@ca/shared';

export default function RedlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: document, isLoading, error } = useDocument(id);
  const [plan, setPlan] = useState<RedlinePlanResponseDto | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const createPlanMutation = useCreateRedlinePlan();

  const handlePlanSubmit = async (instruction: string) => {
    setPlanError(null);
    try {
      const result = await createPlanMutation.mutateAsync({
        documentId: id,
        instruction,
      });
      setPlan(result);
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : copy.common.unexpectedErrorTitle);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={copy.redline.title} subtitle={copy.redline.subtitle} />
        <div className="p-12 text-center text-fg-muted bg-surface border border-border rounded-panel">
          {copy.common.loading}
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="space-y-6">
        <PageHeader title={copy.redline.title} subtitle={copy.redline.subtitle} />
        <EmptyState
          title={copy.common.notFoundTitle}
          description={copy.common.notFoundDescription}
          action={
            <Link href="/documents" className="text-primary hover:underline">
              {copy.common.goToLibrary}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <Link href={`/documents/${id}`} className="text-caption text-primary hover:underline flex items-center gap-1">
          ← Back to document
        </Link>
      </div>

      <PageHeader
        title={copy.redline.title}
        subtitle={`${document.name} · ${copy.redline.subtitle}`}
      />

      <InstructionForm
        document={document}
        isPlanning={createPlanMutation.isPending}
        onSubmit={handlePlanSubmit}
      />

      {planError && (
        <div className="p-4 bg-danger-bg border border-danger-border rounded-input text-body-sm text-danger">
          {planError}
        </div>
      )}

      {plan ? (
        <ProposedEditList plan={plan} />
      ) : (
        <EmptyState
          title={copy.redline.empty.title}
          description={copy.redline.empty.description}
        />
      )}
    </div>
  );
}
