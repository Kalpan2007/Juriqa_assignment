import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

export default async function RedlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <PageHeader title={copy.redline.title} subtitle={copy.redline.subtitle} />
      {/* Replaced by <InstructionForm /> + <ProposedEditList /> in slice F8. */}
      <EmptyState
        title={copy.redline.empty.title}
        description={copy.redline.empty.description}
        action={<span className="text-caption text-fg-subtle">{id}</span>}
      />
    </>
  );
}
