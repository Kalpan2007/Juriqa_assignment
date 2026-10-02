'use client';

import Link from 'next/link';
import { FileText, Trash2 } from 'lucide-react';
import type { DocumentDto } from '@ca/shared';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import { formatBytes, formatDateTime } from '@/lib/format';
import { DocumentStatusBadge } from './document-status-badge';

/**
 * The library table.
 *
 * Only a READY document is a link: opening one that is still extracting would show an empty
 * workspace, and opening a FAILED one would show nothing at all. So the name is plain text
 * until the document can actually be used, and the badge explains why.
 */
export function DocumentTable({
  documents,
  onDelete,
}: {
  documents: DocumentDto[];
  onDelete: (document: DocumentDto) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <th scope="col" className="px-4 py-3 text-caption font-medium text-fg-muted">
              {copy.library.table.name}
            </th>
            <th scope="col" className="px-4 py-3 text-caption font-medium text-fg-muted">
              {copy.library.table.status}
            </th>
            <th scope="col" className="px-4 py-3 text-caption font-medium text-fg-muted">
              {copy.library.table.pages}
            </th>
            <th scope="col" className="px-4 py-3 text-caption font-medium text-fg-muted">
              {copy.library.table.size}
            </th>
            <th scope="col" className="px-4 py-3 text-caption font-medium text-fg-muted">
              {copy.library.table.uploaded}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-caption font-medium text-fg-muted">
              <span className="sr-only">{copy.library.table.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  {document.status === 'READY' ? (
                    <Link
                      href={`/documents/${document.id}`}
                      className="text-body text-fg underline-offset-2 hover:text-primary hover:underline"
                    >
                      {document.name}
                    </Link>
                  ) : (
                    <span className="text-body text-fg-muted">{document.name}</span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3">
                <DocumentStatusBadge
                  status={document.status}
                  statusDetail={document.statusDetail}
                  errorMessage={document.errorMessage}
                />
              </td>
              <td className="px-4 py-3 text-small text-fg-muted">
                {document.pageCount ?? '—'}
              </td>
              <td className="px-4 py-3 text-small text-fg-muted">
                {formatBytes(document.sizeBytes)}
              </td>
              <td className="px-4 py-3 text-small text-fg-muted">
                {formatDateTime(document.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(document)}
                  aria-label={`${copy.library.actions.delete}: ${document.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
