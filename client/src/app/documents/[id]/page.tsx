import { DocumentWorkspace } from '@/features/workspace';

/** Routing only: the page resolves the id and composes the feature (CLAUDE.md). */
export default async function DocumentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocumentWorkspace documentId={id} />;
}
