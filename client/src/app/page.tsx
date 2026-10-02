import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

export default function LibraryPage() {
  return (
    <>
      <PageHeader title={copy.library.title} subtitle={copy.library.subtitle} />
      {/* Replaced by <DocumentLibrary /> from @/features/library in slice F1. */}
      <EmptyState title={copy.library.empty.title} description={copy.library.empty.description} />
    </>
  );
}
