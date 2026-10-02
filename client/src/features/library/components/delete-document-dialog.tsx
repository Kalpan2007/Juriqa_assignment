'use client';

import { toast } from 'sonner';
import type { DocumentDto } from '@ca/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copy, format } from '@/content/copy';
import { ApiError } from '@/lib/api-client';
import { resolveErrorMessage } from '@/content/error-messages';
import { useDeleteDocument } from '../hooks/use-documents';

/**
 * Delete confirmation.
 *
 * The description says what ELSE goes with the document — its chats and any comparisons that
 * use it — because those cascade in the database and a user who is not told will be surprised
 * by it (ARCHITECTURE section 4, delete edge case).
 */
export function DeleteDocumentDialog({
  document,
  onClose,
}: {
  document: DocumentDto | null;
  onClose: () => void;
}) {
  const remove = useDeleteDocument();

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {document !== null && (
          <>
            <DialogTitle>{copy.library.delete.title}</DialogTitle>
            <DialogDescription>
              {format(copy.library.delete.description, { name: document.name })}
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={remove.isPending}>
                {copy.library.delete.cancel}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(document.id, {
                    onSuccess: onClose,
                    onError: (error) => {
                      const code = ApiError.isApiError(error) ? error.code : undefined;
                      const { title } = resolveErrorMessage(code);
                      toast.error(title);
                    },
                  });
                }}
              >
                {copy.library.delete.confirm}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
