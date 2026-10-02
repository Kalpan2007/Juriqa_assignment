'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, NetworkError } from '@/lib/api-client';
import { resolveErrorMessage } from '@/content/error-messages';
import { copy, format } from '@/content/copy';
import { cn } from '@/lib/cn';
import { useUploadDocument } from '../hooks/use-documents';

/** Mirrors MAX_UPLOAD_MB on the server; only used for the hint text. */
const MAX_UPLOAD_MB = 25;

/**
 * Drag-and-drop upload.
 *
 * The file type is NOT checked here beyond the input's `accept` hint. The server sniffs the
 * bytes, and it is the only thing that can tell a renamed `.exe` from a PDF — so the client
 * sends the file and shows whatever specific reason comes back. Guessing in the browser would
 * only produce a second, less accurate set of rules to keep in sync.
 */
export function UploadDropzone() {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      upload.mutate(file, {
        onSuccess: (result) => {
          if (result.duplicateOfName) {
            toast.info(format(copy.library.upload.duplicate, { name: result.duplicateOfName }));
          }
        },
        onError: (error) => {
          // The server's error code decides the wording, so an unsupported .doc gets the
          // "save it as .docx" message rather than a generic failure.
          const code = ApiError.isApiError(error) ? error.code : undefined;
          const serverMessage = ApiError.isApiError(error) ? error.serverMessage : undefined;
          const { title, description } =
            error instanceof NetworkError
              ? { title: error.message, description: '' }
              : resolveErrorMessage(code, serverMessage);
          toast.error(title, { description: description || undefined });
        },
      });
    },
    [upload],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        'rounded-card border border-dashed transition-colors',
        isDragging ? 'border-primary bg-primary-subtle' : 'border-border bg-surface',
      )}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="flex w-full flex-col items-center gap-2 px-6 py-10 text-center disabled:cursor-not-allowed"
      >
        {upload.isPending ? (
          <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" aria-hidden="true" />
        ) : (
          <Upload className="h-6 w-6 text-fg-subtle" aria-hidden="true" />
        )}
        <span className="text-body text-fg">
          {upload.isPending ? copy.library.upload.uploading : copy.library.upload.dropzone}
        </span>
        <span className="text-caption text-fg-muted">
          {format(copy.library.upload.hint, { maxMb: MAX_UPLOAD_MB })}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so selecting the same file twice fires change again.
          event.target.value = '';
        }}
      />
    </div>
  );
}
