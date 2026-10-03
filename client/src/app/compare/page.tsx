'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { VersionPicker } from '@/features/compare';
import { copy } from '@/content/copy';

export default function ComparePage() {
  const searchParams = useSearchParams();
  const preBase = searchParams.get('base') ?? undefined;
  const preModified = searchParams.get('revised') ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.compare.title} subtitle={copy.compare.subtitle} />
      <VersionPicker initialBaseId={preBase} initialRevisedId={preModified} />
    </div>
  );
}
