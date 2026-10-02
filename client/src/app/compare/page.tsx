import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

export default function ComparePage() {
  return (
    <>
      <PageHeader title={copy.compare.title} subtitle={copy.compare.subtitle} />
      {/* Replaced by <VersionPicker /> from @/features/compare in slice F7. */}
      <EmptyState title={copy.compare.empty.title} description={copy.compare.empty.description} />
    </>
  );
}
