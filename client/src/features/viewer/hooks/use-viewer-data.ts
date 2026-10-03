'use client';

import { useQuery } from '@tanstack/react-query';
import { libraryApi } from '@/features/library';

export function useDocumentLayout(documentId: string, enabled = true) {
  return useQuery({
    queryKey: ['documents', documentId, 'layout'],
    queryFn: () => libraryApi.layout(documentId),
    enabled: Boolean(documentId) && enabled,
    staleTime: Infinity,
  });
}

export function useDocumentPages(documentId: string, from: number, to: number, enabled = true) {
  return useQuery({
    queryKey: ['documents', documentId, 'pages', from, to],
    queryFn: () => libraryApi.pages(documentId, from, to),
    enabled: Boolean(documentId) && enabled && from >= 1 && to >= from,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDocumentHtml(documentId: string, enabled = true) {
  return useQuery({
    queryKey: ['documents', documentId, 'html'],
    queryFn: () => libraryApi.html(documentId),
    enabled: Boolean(documentId) && enabled,
    staleTime: Infinity,
  });
}
