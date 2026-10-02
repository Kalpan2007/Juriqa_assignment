'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isFinalStatus, type DocumentDto } from '@ca/shared';
import { libraryApi } from '../api';

export const documentKeys = {
  all: ['documents'] as const,
  list: () => [...documentKeys.all, 'list'] as const,
  detail: (id: string) => [...documentKeys.all, 'detail', id] as const,
  warnings: (id: string) => [...documentKeys.all, 'warnings', id] as const,
};

/** How often a processing document is polled. */
const POLL_INTERVAL_MS = 1_500;

/**
 * The document list, polled while anything is still processing.
 *
 * Polling stops the moment every document is in a final state, so an idle library makes no
 * requests. The server deliberately does not rate-limit these reads (decision D9) — a shared
 * limit would throttle the app's own progress indicator.
 */
export function useDocuments() {
  return useQuery({
    queryKey: documentKeys.list(),
    queryFn: () => libraryApi.list(),
    refetchInterval: (query) => {
      const documents = query.state.data;
      if (documents === undefined) return false;
      const stillWorking = documents.some((document) => !isFinalStatus(document.status));
      return stillWorking ? POLL_INTERVAL_MS : false;
    },
  });
}

/** One document, polled until it reaches a final state. Used by the workspace header. */
export function useDocument(id: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => libraryApi.get(id),
    enabled,
    refetchInterval: (query) => {
      const document = query.state.data;
      if (document === undefined) return false;
      return isFinalStatus(document.status) ? false : POLL_INTERVAL_MS;
    },
  });
}

/** The "pages 12–15 contain no readable text" warning, once a document is ready. */
export function useDocumentWarnings(id: string, enabled: boolean) {
  return useQuery({
    queryKey: documentKeys.warnings(id),
    queryFn: () => libraryApi.warnings(id),
    enabled,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => libraryApi.upload(file),
    onSuccess: () => {
      // Refetch immediately so the new row appears with its processing status, which also
      // restarts polling.
      void queryClient.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => libraryApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: documentKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: documentKeys.list() });
    },
  });
}

export type { DocumentDto };
