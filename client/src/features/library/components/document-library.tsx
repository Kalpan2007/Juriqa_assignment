'use client';

import { useState } from 'react';
import { FileText, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import type { DocumentDto } from '@ca/shared';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { copy } from '@/content/copy';
import { useDocuments } from '../hooks/use-documents';
import { libraryApi } from '../api';
import { DocumentTable } from './document-table';
import { UploadDropzone } from './upload-dropzone';
import { DeleteDocumentDialog } from './delete-document-dialog';

export function DocumentLibrary() {
  const { data: documents, isPending, isError, error, refetch } = useDocuments();
  const [pendingDelete, setPendingDelete] = useState<DocumentDto | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);

  const handleSeedSamples = async () => {
    try {
      setIsSeeding(true);
      setSeedSuccess(null);
      const res = await libraryApi.seedSamples();
      setSeedSuccess(`Loaded ${res.count} sample contracts successfully!`);
      await refetch();
      setTimeout(() => setSeedSuccess(null), 6000);
    } catch (err) {
      console.error('Failed to load sample contracts', err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col">
          <h2 className="text-body font-semibold text-fg">Test Contract Sandbox</h2>
          <p className="text-caption text-fg-muted">
            Instantly load 5 test agreements covering all edge cases (162-page PDF, DOCX v1 & v2 for diffing/redline, Mutual NDA, Scanned PDF guardrail).
          </p>
        </div>
        <Button
          onClick={handleSeedSamples}
          disabled={isSeeding}
          className="bg-primary text-primary-fg hover:bg-primary-hover shadow-xs gap-2"
        >
          {isSeeding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Importing Samples...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>Load 5 Demo Contracts</span>
            </>
          )}
        </Button>
      </div>

      {seedSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-verified-border bg-verified-bg p-3 text-small text-verified">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{seedSuccess}</span>
        </div>
      )}

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
