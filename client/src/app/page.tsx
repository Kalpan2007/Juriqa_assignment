import { PageHeader } from '@/components/layout/page-header';
import { DocumentLibrary } from '@/features/library';
import { copy } from '@/content/copy';

/** Routing only: the page composes the feature and holds no logic (CLAUDE.md). */
export default function LibraryPage() {
  return (
    <>
      <PageHeader title={copy.library.title} subtitle={copy.library.subtitle} />
      <DocumentLibrary />
    </>
  );
}
