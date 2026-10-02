import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

export default function AskAcrossPage() {
  return (
    <>
      <PageHeader title={copy.multiDoc.title} subtitle={copy.multiDoc.subtitle} />
      {/* Replaced by <MultiDocChat /> from @/features/multi-doc in slice F6. */}
      <EmptyState title={copy.multiDoc.empty.title} description={copy.multiDoc.empty.description} />
    </>
  );
}
