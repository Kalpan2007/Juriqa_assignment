'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Trash2, Search, GitCompare, ArrowRight, CheckSquare, Square } from 'lucide-react';
import type { DocumentDto } from '@ca/shared';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import { formatBytes, formatDateTime } from '@/lib/format';
import { DocumentStatusBadge } from './document-status-badge';

export function DocumentTable({
  documents,
  onDelete,
}: {
  documents: DocumentDto[];
  onDelete: (document: DocumentDto) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) => doc.name.toLowerCase().includes(q));
  }, [documents, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleCompareSelected = () => {
    if (selectedIds.length === 2) {
      router.push(`/compare?base=${selectedIds[0]}&modified=${selectedIds[1]}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-72 max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contracts by title..."
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-1.5 text-small text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-hidden"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary-subtle px-3 py-1.5 text-small text-primary">
            <span className="font-medium">{selectedIds.length} selected</span>
            {selectedIds.length === 2 ? (
              <Button
                size="sm"
                onClick={handleCompareSelected}
                className="gap-1.5 bg-primary text-primary-fg hover:bg-primary-hover"
              >
                <GitCompare className="h-3.5 w-3.5" />
                Compare These 2 Contracts
              </Button>
            ) : (
              <span className="text-caption text-fg-subtle">
                (Select exactly 2 to compare)
              </span>
            )}
            <button
              onClick={() => setSelectedIds([])}
              className="text-caption underline hover:text-fg ml-2"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-surface-muted/60">
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Contract
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Pages
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Size
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Uploaded
              </th>
              <th scope="col" className="px-4 py-3 text-right text-caption font-semibold uppercase tracking-wider text-fg-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((document) => {
              const isSelected = selectedIds.includes(document.id);
              const isReady = document.status === 'READY';

              return (
                <tr
                  key={document.id}
                  className={`border-b border-border last:border-b-0 transition-colors ${
                    isSelected ? 'bg-primary-subtle/50' : 'hover:bg-surface-hover/50'
                  }`}
                >
                  <td className="px-4 py-3.5">
                    {isReady ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(document.id)}
                        className="text-fg-subtle hover:text-primary"
                        aria-label={`Select ${document.name}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="h-4 w-4 block opacity-30" />
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-fg-subtle border border-border">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        {isReady ? (
                          <Link
                            href={`/documents/${document.id}`}
                            className="text-body font-medium text-fg hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            <span className="truncate">{document.name}</span>
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-micro font-semibold text-fg-subtle border border-border">
                              {document.kind}
                            </span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-body font-medium text-fg-muted truncate">{document.name}</span>
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-micro font-semibold text-fg-subtle border border-border">
                              {document.kind}
                            </span>
                          </div>
                        )}
                        <span className="text-caption text-fg-subtle">
                          ID: {document.id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <DocumentStatusBadge
                      status={document.status}
                      statusDetail={document.statusDetail}
                      errorMessage={document.errorMessage}
                    />
                  </td>
                  <td className="px-4 py-3.5 text-small text-fg-muted">
                    {document.pageCount ? `${document.pageCount} pgs` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-small text-fg-muted">
                    {formatBytes(document.sizeBytes)}
                  </td>
                  <td className="px-4 py-3.5 text-small text-fg-muted">
                    {formatDateTime(document.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isReady && (
                        <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-primary hover:text-primary-hover">
                          <Link href={`/documents/${document.id}`}>
                            Open
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-fg-subtle hover:text-danger"
                        onClick={() => onDelete(document)}
                        aria-label={`${copy.library.actions.delete}: ${document.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
