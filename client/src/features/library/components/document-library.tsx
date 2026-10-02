'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { DocumentDto } from '@ca/shared';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api-client';
import { copy } from '@/content/copy';
import { useDocuments } from '../hooks/use-documents';
import { DocumentTable } from './document-table';
import { UploadDropzone } from './upload-dropzone';
import { DeleteDocumentDialog } from './delete-document-dialog';

/**
 * The library screen: upload, list, open, delete.
 *
 * Every one of the three states ARCHITECTURE section 13.3 requires is explicit here —
 * loading (skeleton), empty (with the next action), error (with retry) — rather than the
 * usual silent blank page while a request is in flight.
 */
export function DocumentLibrary() {
  const { data: documents, isPending, isError, error, refetch } = useDocuments();
  const [pendingDelete, setPendingDelete] = useState<DocumentDto | null>(null);

  return (
    <div className="space-y-6">
      <UploadDropzone />

      {isPending && <TableSkeleton rows={3} />}

      {isError && (
        <ErrorState
          code={ApiError.isApiError(error) ? error.code : undefined}
          serverMessage={ApiError.isApiError(error) ? error.serverMessage : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {documents !== undefined && documents.length === 0 && (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={copy.library.empty.title}
          description={copy.library.empty.description}
        />
      )}

      {documents !== undefined && documents.length > 0 && (
        <DocumentTable documents={documents} onDelete={setPendingDelete} />
      )}

      <DeleteDocumentDialog document={pendingDelete} onClose={() => setPendingDelete(null)} />
    </div>
  );
}
