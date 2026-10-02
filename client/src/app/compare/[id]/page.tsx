import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

export default async function ComparisonResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <PageHeader title={copy.compare.summary.title} subtitle={id} />
      {/* Replaced by <ChangeList /> from @/features/compare in slice F7. */}
      <EmptyState title={copy.compare.empty.title} description={copy.compare.empty.description} />
    </>
  );
}
