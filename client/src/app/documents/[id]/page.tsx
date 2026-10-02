import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/feedback';
import { copy } from '@/content/copy';

/**
 * The document workspace: viewer (left) + chat (right) once slices F3 and F5 land.
 * In Next 16 route params are async.
 */
export default async function DocumentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <PageHeader title={copy.viewer.title} subtitle={id} />
      {/* Replaced by <DocumentViewer /> + <ChatPanel /> in slices F5 and F3. */}
      <EmptyState title={copy.chat.empty.title} description={copy.chat.empty.description} />
    </>
  );
}
