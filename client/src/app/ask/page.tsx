import { PageHeader } from '@/components/layout/page-header';
import { MultiDocChat } from '@/features/multi-doc';
import { copy } from '@/content/copy';

export default function AskAcrossPage() {
  return (
    <>
      <PageHeader title={copy.multiDoc.title} subtitle={copy.multiDoc.subtitle} />
      <MultiDocChat />
    </>
  );
}
