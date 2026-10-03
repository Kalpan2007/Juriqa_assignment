'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, GitCompare, ArrowRight } from 'lucide-react';
import { useDocuments } from '@/features/library';
import { useCreateComparison } from '../hooks/use-comparison';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

export function VersionPicker({
  initialBaseId,
  initialRevisedId,
}: {
  initialBaseId?: string;
  initialRevisedId?: string;
}) {
  const router = useRouter();
  const { data: documents, isLoading: isLoadingDocs } = useDocuments();
  const createComparison = useCreateComparison();

  const [baseId, setBaseId] = useState<string>(initialBaseId ?? '');
  const [revisedId, setRevisedId] = useState<string>(initialRevisedId ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const autoFired = useRef(false);

  const readyDocs = (documents ?? []).filter((d) => d.status === 'READY');

  /**
   * When both IDs were pre-filled from URL params (clicked "Compare These 2 Contracts"
   * from the library), auto-fire the comparison as soon as the docs list loads.
   */
  useEffect(() => {
    if (
      !autoFired.current &&
      initialBaseId &&
      initialRevisedId &&
      readyDocs.length > 0 &&
      !isLoadingDocs &&
      !createComparison.isPending
    ) {
      autoFired.current = true;
      void handleCompareDirectly(initialBaseId, initialRevisedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyDocs.length, isLoadingDocs]);

  const handleCompareDirectly = async (base: string, revised: string) => {
    if (!base || !revised) return;
    if (base === revised) {
      setErrorMsg(copy.compare.picker.sameDocument);
      return;
    }
    setErrorMsg(null);
    try {
      const result = await createComparison.mutateAsync({
        baseDocumentId: base,
        revisedDocumentId: revised,
      });
      router.push(`/compare/${result.id}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : copy.compare.error.title);
    }
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleCompareDirectly(baseId, revisedId);
  };

  // While auto-firing the comparison from URL params, show a loading card
  const isAutoFiring =
    Boolean(initialBaseId) &&
    Boolean(initialRevisedId) &&
    !autoFired.current;

  if (isLoadingDocs || (isAutoFiring && !errorMsg)) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-10 text-center shadow-xs">
        <div className="flex flex-col items-center gap-3 text-fg-muted">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-body font-medium text-fg">
            {isLoadingDocs ? 'Loading documents…' : 'Starting comparison…'}
          </p>
          <p className="text-small text-fg-muted">
            {isLoadingDocs
              ? 'Fetching your document library'
              : 'Comparing clauses and calculating changes'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleCompare}
      className="mx-auto max-w-2xl space-y-6 rounded-xl border border-border bg-surface p-6 shadow-xs"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <GitCompare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-body font-semibold text-fg">{copy.compare.title}</h2>
          <p className="text-caption text-fg-muted">{copy.compare.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Base document selector */}
        <div className="space-y-1.5">
          <label htmlFor="base-doc-select" className="text-caption font-semibold text-fg">
            {copy.compare.picker.base}
          </label>
          <select
            id="base-doc-select"
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            disabled={isLoadingDocs || createComparison.isPending}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-small text-fg focus:border-primary focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select original version…</option>
            {readyDocs.map((doc) => (
              <option key={`base-${doc.id}`} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Revised document selector */}
        <div className="space-y-1.5">
          <label htmlFor="revised-doc-select" className="text-caption font-semibold text-fg">
            {copy.compare.picker.revised}
          </label>
          <select
            id="revised-doc-select"
            value={revisedId}
            onChange={(e) => setRevisedId(e.target.value)}
            disabled={isLoadingDocs || createComparison.isPending}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-small text-fg focus:border-primary focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select revised version…</option>
            {readyDocs.map((doc) => (
              <option key={`rev-${doc.id}`} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-small text-danger">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-caption text-fg-subtle">
          Select two <strong>READY</strong> contracts, then compare.
        </p>
        <Button
          type="submit"
          disabled={!baseId || !revisedId || baseId === revisedId || createComparison.isPending}
          className="gap-2 bg-primary text-primary-fg hover:bg-primary-hover shadow-xs"
        >
          {createComparison.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.compare.running}
            </>
          ) : (
            <>
              {copy.compare.picker.action}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
