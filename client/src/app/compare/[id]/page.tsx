'use client';

import { use } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { useComparison, ChangeList } from '@/features/compare';
import { copy } from '@/content/copy';

export default function ComparisonResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: comparison, isLoading, error } = useComparison(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={copy.compare.summary.title} subtitle={id} />
        <div className="p-12 text-center text-fg-muted bg-surface border border-border rounded-panel">
          {copy.compare.running}
        </div>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="space-y-6">
        <PageHeader title={copy.compare.summary.title} subtitle={id} />
        <EmptyState
          title={copy.compare.error.title}
          description={error?.message || copy.compare.error.description}
          action={
            <Link href="/compare" className="text-primary hover:underline">
              ← Back to compare
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/compare" className="text-caption text-primary hover:underline flex items-center gap-1">
          ← Back to version selection
        </Link>
      </div>
      <ChangeList comparison={comparison} />
    </div>
  );
}
