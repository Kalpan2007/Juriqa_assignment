'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import type { MessageDto, QuoteDto } from '@ca/shared';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { copy } from '@/content/copy';
import {
  useChat,
  useChatsForDocument,
  useCreateChat,
  useSendMessage,
  streamingAsMessage,
} from '../hooks/use-chat';
import { ChatHistoryList } from './chat-history-list';
import { ChatInput } from './chat-input';
import { MessageList } from './message-list';

/**
 * Chat with one document (ARCHITECTURE section 7).
 *
 * A chat is created lazily, on the first question, so opening a document does not litter the
 * history with empty conversations.
 */
export function ChatPanel({
  documentId,
  onOpenQuote,
}: {
  documentId: string;
  /** Opens the viewer at the quote's passage. Wired up by slice F5. */
  onOpenQuote?: (quote: QuoteDto) => void;
}) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const chats = useChatsForDocument(documentId);
  const chat = useChat(activeChatId);
  const createChat = useCreateChat(documentId);
  const { send, stop, streaming, isStreaming } = useSendMessage(activeChatId, documentId);

  /**
   * Sends the question that was asked before a chat existed.
   *
   * The first question has to wait for the chat to be created, so it is parked here and sent
   * once `activeChatId` is set. Without this the very first question of a session would be
   * silently dropped.
   */
  useEffect(() => {
    if (activeChatId === null || pendingQuestion === null) return;
    const question = pendingQuestion;
    setPendingQuestion(null);
    void send(question);
  }, [activeChatId, pendingQuestion, send]);

  const handleSend = (content: string) => {
    if (activeChatId !== null) {
      void send(content);
      return;
    }
    setPendingQuestion(content);
    createChat.mutate(undefined, {
      onSuccess: (created) => setActiveChatId(created.id),
      onError: () => setPendingQuestion(null),
    });
  };

  /**
   * Saved messages plus the one currently streaming, as a single list.
   *
   * The user’s own question is persisted by the server before the stream opens, so it
   * arrives with the next refetch; only the assistant’s in-flight answer needs appending.
   */
  const messages = useMemo<MessageDto[]>(() => {
    const saved = chat.data?.messages ?? [];
    if (streaming === null) return saved;
    return [...saved, streamingAsMessage(streaming)];
  }, [chat.data?.messages, streaming]);

  const lastAnswer = [...(chat.data?.messages ?? [])].reverse().find((m) => m.role === 'ASSISTANT');
  const offerThoroughSearch =
    !isStreaming &&
    lastAnswer?.answerStatus === 'NOT_FOUND' &&
    lastAnswer.mode === 'RETRIEVAL' &&
    lastAnswer.coverage?.complete === false;

  const isBusy = isStreaming || createChat.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-surface px-3 py-2">
        <ChatHistoryList
          chats={chats.data ?? []}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          onNew={() => setActiveChatId(null)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-4">
        {chat.isError && (
          <ErrorState
            code={ApiError.isApiError(chat.error) ? chat.error.code : undefined}
            onRetry={() => void chat.refetch()}
          />
        )}

        {activeChatId !== null && chat.isPending && <LoadingState message={copy.common.loading} />}

        {messages.length === 0 && !chat.isPending && !isBusy && (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title={copy.chat.empty.title}
            description={copy.chat.empty.description}
          />
        )}

        {messages.length > 0 && (
          <MessageList
            messages={messages}
            onOpenQuote={onOpenQuote}
            progress={streaming?.progress ?? null}
            notices={streaming?.notices ?? []}
          />
        )}

        {/**
         * Cost-aware escalation (ARCHITECTURE section 6): after a "not found" from a partial
         * read, the user is OFFERED a whole-document search rather than having one run
         * automatically and silently spend tokens.
         */}
        {offerThoroughSearch && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const question = [...(chat.data?.messages ?? [])]
                  .reverse()
                  .find((m) => m.role === 'USER')?.content;
                if (question !== undefined) void send(question, { mode: 'THOROUGH' });
              }}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.chat.searchWholeDocument}
            </Button>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} onStop={stop} isStreaming={isStreaming} disabled={createChat.isPending} />
    </div>
  );
}
