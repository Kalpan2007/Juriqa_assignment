'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDocuments } from '@/features/library';
import { useCreateComparison } from '../hooks/use-comparison';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

export function VersionPicker() {
  const router = useRouter();
  const { data: documents, isLoading: isLoadingDocs } = useDocuments();
  const createComparison = useCreateComparison();

  const [baseId, setBaseId] = useState<string>('');
  const [revisedId, setRevisedId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const readyDocs = (documents ?? []).filter((d) => d.status === 'READY');

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!baseId || !revisedId) {
      return;
    }

    if (baseId === revisedId) {
      setErrorMsg(copy.compare.picker.sameDocument);
      return;
    }

    try {
      const result = await createComparison.mutateAsync({
        baseDocumentId: baseId,
        revisedDocumentId: revisedId,
      });
      router.push(`/compare/${result.id}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : copy.compare.error.title);
    }
  };

  return (
    <form onSubmit={handleCompare} className="max-w-2xl mx-auto p-6 bg-surface border border-border rounded-panel shadow-sm space-y-6">
      <div className="space-y-1">
        <h2 className="text-h3 font-semibold text-fg">{copy.compare.title}</h2>
        <p className="text-body-sm text-fg-muted">{copy.compare.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="base-doc-select" className="text-caption font-medium text-fg">
            {copy.compare.picker.base}
          </label>
          <select
            id="base-doc-select"
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            disabled={isLoadingDocs || createComparison.isPending}
            className="w-full h-10 px-3 py-2 text-body-sm bg-surface border border-border rounded-input text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select original version...</option>
            {readyDocs.map((doc) => (
              <option key={`base-${doc.id}`} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="revised-doc-select" className="text-caption font-medium text-fg">
            {copy.compare.picker.revised}
          </label>
          <select
            id="revised-doc-select"
            value={revisedId}
            onChange={(e) => setRevisedId(e.target.value)}
            disabled={isLoadingDocs || createComparison.isPending}
            className="w-full h-10 px-3 py-2 text-body-sm bg-surface border border-border rounded-input text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select revised version...</option>
            {readyDocs.map((doc) => (
              <option key={`rev-${doc.id}`} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-caption text-danger bg-danger-bg border border-danger-border rounded-input">
          {errorMsg}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={!baseId || !revisedId || createComparison.isPending}
        >
          {createComparison.isPending ? copy.compare.running : copy.compare.picker.action}
        </Button>
      </div>
    </form>
  );
}
