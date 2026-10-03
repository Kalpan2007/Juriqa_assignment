'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CoverageDto,
  MessageDto,
  QuoteDto,
  RetrievalMode,
  SseEvent,
} from '@ca/shared';
import { ApiError } from '@/lib/api-client';
import { chatApi } from '../api';

export const chatKeys = {
  all: ['chats'] as const,
  detail: (chatId: string) => [...chatKeys.all, 'detail', chatId] as const,
  forDocument: (documentId: string) => [...chatKeys.all, 'document', documentId] as const,
};

/** Previous chats for a document, most recent first. */
export function useChatsForDocument(documentId: string) {
  return useQuery({
    queryKey: chatKeys.forDocument(documentId),
    queryFn: () => chatApi.listForDocument(documentId),
  });
}

/** One saved chat, with its messages, quotes and coverage. */
export function useChat(chatId: string | null) {
  return useQuery({
    queryKey: chatKeys.detail(chatId ?? ''),
    queryFn: () => chatApi.get(chatId as string),
    enabled: chatId !== null,
  });
}

export function useCreateChat(documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chatApi.create([documentId]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.forDocument(documentId) });
    },
  });
}

/**
 * The answer currently being streamed.
 *
 * Held in component state rather than the query cache, because it changes many times a second
 * and React Query is not the right tool for that. Once the stream finishes, the saved chat is
 * refetched and this is cleared — so there is exactly one source of truth for a finished
 * answer, and no chance of showing a stale streamed copy next to the saved one.
 */
export interface StreamingAnswer {
  text: string;
  mode: RetrievalMode;
  coverage: CoverageDto | null;
  quotes: QuoteDto[];
  /** Progress through a thorough read, when one is running. */
  progress: { done: number; total: number; label: string } | null;
  notices: Array<{ code: string; message: string }>;
  error: { code: string; message: string } | null;
  finished: boolean;
  stopped: boolean;
}

const EMPTY_STREAM: StreamingAnswer = {
  text: '',
  mode: 'RETRIEVAL',
  coverage: null,
  quotes: [],
  progress: null,
  notices: [],
  error: null,
  finished: false,
  stopped: false,
};

export function useSendMessage(chatId: string | null, documentId: string) {
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState<StreamingAnswer | null>(null);
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<MessageDto | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (content: string, options?: { mode?: RetrievalMode }) => {
      if (chatId === null) return;

      const userMsg: MessageDto = {
        id: `optimistic-user-${Date.now()}`,
        role: 'USER',
        content,
        status: 'DONE',
        answerStatus: null,
        mode: options?.mode ?? 'RETRIEVAL',
        coverage: null,
        documentCoverage: [],
        errorCode: null,
        quotes: [],
        createdAt: new Date().toISOString(),
      };
      setOptimisticUserMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming({ ...EMPTY_STREAM, mode: options?.mode ?? 'RETRIEVAL' });

      const apply = (update: (previous: StreamingAnswer) => StreamingAnswer) => {
        setStreaming((previous) => update(previous ?? { ...EMPTY_STREAM }));
      };

      try {
        await chatApi.sendMessage(
          chatId,
          { content, ...(options?.mode ? { mode: options.mode } : {}) },
          controller.signal,
          (event: SseEvent) => {
            switch (event.type) {
              case 'meta':
                apply((previous) => ({ ...previous, mode: event.mode, coverage: event.coverage }));
                break;
              case 'delta':
                apply((previous) => ({ ...previous, text: previous.text + event.text }));
                break;
              case 'progress':
                apply((previous) => ({
                  ...previous,
                  progress: { done: event.done, total: event.total, label: event.label },
                }));
                break;
              case 'quotes':
                apply((previous) => ({
                  ...previous,
                  quotes: event.quotes,
                  coverage: event.coverage ?? previous.coverage,
                }));
                break;
              case 'notice':
                apply((previous) => ({
                  ...previous,
                  notices: [...previous.notices, { code: event.code, message: event.message }],
                }));
                break;
              case 'error':
                apply((previous) => ({
                  ...previous,
                  error: { code: event.code, message: event.message },
                }));
                break;
              case 'done':
                apply((previous) => ({
                  ...previous,
                  finished: true,
                  stopped: event.status === 'STOPPED',
                  progress: null,
                }));
                break;
            }
          },
        );
      } catch (error) {
        const code = ApiError.isApiError(error) ? error.code : 'INTERNAL';
        const message = ApiError.isApiError(error)
          ? error.serverMessage
          : 'The answer could not be completed.';
        apply((previous) => ({ ...previous, error: { code, message }, finished: true }));
      } finally {
        abortRef.current = null;
        /**
         * Refetch the saved chat and drop the streamed copy.
         *
         * Order matters: the refetch is awaited before clearing, so the finished answer is
         * already in the cache when the streamed one disappears. Clearing first would blank
         * the answer for a moment, which looks like it was lost.
         */
        await queryClient.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.forDocument(documentId) });
        setStreaming(null);
        setOptimisticUserMessage(null);
      }
    },
    [chatId, documentId, queryClient],
  );

  /** Stop. Aborting the request is all it takes; the server saves what it has. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    send,
    stop,
    streaming,
    isStreaming: streaming !== null && !streaming.finished,
    optimisticUserMessage,
  };
}

/** The streamed answer rendered as a message, so one component can display both. */
export function streamingAsMessage(streaming: StreamingAnswer): MessageDto {
  return {
    id: 'streaming',
    role: 'ASSISTANT',
    content: streaming.text,
    status: streaming.finished ? (streaming.stopped ? 'STOPPED' : 'DONE') : 'STREAMING',
    // Never derived on the client: the server decides, and only after verification.
    answerStatus: null,
    mode: streaming.mode,
    coverage: streaming.coverage,
    documentCoverage: [],
    errorCode: streaming.error?.code ?? null,
    quotes: streaming.quotes,
    createdAt: new Date().toISOString(),
  };
}
