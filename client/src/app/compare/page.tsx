'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { VersionPicker } from '@/features/compare';
import { copy } from '@/content/copy';

function CompareContent() {
  const searchParams = useSearchParams();
  const preBase = searchParams.get('base') ?? undefined;
  const preModified = searchParams.get('revised') ?? undefined;

  return <VersionPicker initialBaseId={preBase} initialRevisedId={preModified} />;
}

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <PageHeader title={copy.compare.title} subtitle={copy.compare.subtitle} />
      <Suspense fallback={<div className="p-8 text-center text-fg-muted">Loading compare view…</div>}>
        <CompareContent />
      </Suspense>
    </div>
  );
}
