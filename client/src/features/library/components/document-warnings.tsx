'use client';

import { AlertTriangle } from 'lucide-react';
import { useDocumentWarnings } from '../hooks/use-documents';

/**
 * The partial-scan warning (decision D10).
 *
 * Shown above the document, not tucked away: if some pages could not be read, the user has to
 * know before they trust an answer about what the contract does or does not say.
 */
export function DocumentWarnings({ documentId, enabled }: { documentId: string; enabled: boolean }) {
  const { data } = useDocumentWarnings(documentId, enabled);
  if (!data?.scannedPages) return null;

  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-md border border-unverified-border bg-unverified-bg px-3 py-2"
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-unverified" aria-hidden="true" />
      <span className="text-small text-fg">{data.scannedPages}</span>
    </div>
  );
}
