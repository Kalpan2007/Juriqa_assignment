'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  History,
  Plus,
  Sparkles,
  Scale,
  ShieldAlert,
  Coins,
  ChevronDown,
} from 'lucide-react';
import type { MessageDto, QuoteDto, RetrievalMode } from '@ca/shared';
import { ErrorState, LoadingState } from '@/components/feedback';
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

const STARTER_PROMPTS = [
  {
    icon: Coins,
    title: 'Financial Commitments',
    prompt: 'What is the total commitment amount under this agreement?',
    thorough: false,
    tag: 'Fast Retrieval',
  },
  {
    icon: Search,
    title: 'Absence Audit (Non-Compete)',
    prompt: 'Is there a non-compete restriction or exclusivity clause in this contract?',
    thorough: true,
    tag: 'Thorough Scan',
  },
  {
    icon: Scale,
    title: 'Governing Law',
    prompt: 'What is the governing law and dispute resolution mechanism in this contract?',
    thorough: false,
    tag: 'Fast Retrieval',
  },
  {
    icon: ShieldAlert,
    title: 'Default Triggers',
    prompt: 'What are the events of default and remedy periods?',
    thorough: false,
    tag: 'Fast Retrieval',
  },
];

export function ChatPanel({
  documentId,
  onOpenQuote,
}: {
  documentId: string;
  onOpenQuote?: (quote: QuoteDto) => void;
}) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    content: string;
    mode?: RetrievalMode;
  } | null>(null);

  const chats = useChatsForDocument(documentId);
  const chat = useChat(activeChatId);
  const createChat = useCreateChat(documentId);
  const { send, stop, streaming, isStreaming, optimisticUserMessage } = useSendMessage(
    activeChatId,
    documentId,
  );

  useEffect(() => {
    if (activeChatId === null || pendingQuestion === null) return;
    const { content, mode } = pendingQuestion;
    setPendingQuestion(null);
    void send(content, mode === undefined ? undefined : { mode });
  }, [activeChatId, pendingQuestion, send]);

  const handleSend = (content: string, options?: { thorough: boolean }) => {
    const mode: RetrievalMode | undefined = options?.thorough === true ? 'THOROUGH' : undefined;
    if (activeChatId !== null) {
      void send(content, mode === undefined ? undefined : { mode });
      return;
    }
    // Optimistically store pending question so it renders immediately before chat creation finishes
    setPendingQuestion({ content, ...(mode === undefined ? {} : { mode }) });
    createChat.mutate(undefined, {
      onSuccess: (created) => setActiveChatId(created.id),
      onError: () => setPendingQuestion(null),
    });
  };

  const messages = useMemo<MessageDto[]>(() => {
    const saved = chat.data?.messages ?? [];
    const result = [...saved];

    // Optimistically render the user question immediately upon submit
    const currentPendingContent = pendingQuestion?.content ?? optimisticUserMessage?.content;
    if (currentPendingContent) {
      const alreadySaved = saved.some(
        (m) => m.role === 'USER' && m.content === currentPendingContent,
      );
      if (!alreadySaved) {
        result.push(
          optimisticUserMessage ?? {
            id: 'optimistic-user-pending',
            role: 'USER',
            content: currentPendingContent,
            status: 'DONE',
            answerStatus: null,
            mode: pendingQuestion?.mode ?? 'RETRIEVAL',
            coverage: null,
            documentCoverage: [],
            errorCode: null,
            quotes: [],
            createdAt: new Date().toISOString(),
          },
        );
      }
    }

    // Render streaming or thinking assistant message immediately
    if (streaming !== null) {
      result.push(streamingAsMessage(streaming));
    } else if (pendingQuestion !== null || createChat.isPending) {
      result.push({
        id: 'optimistic-assistant-thinking',
        role: 'ASSISTANT',
        content: '',
        status: 'STREAMING',
        answerStatus: null,
        mode: pendingQuestion?.mode ?? 'RETRIEVAL',
        coverage: null,
        documentCoverage: [],
        errorCode: null,
        quotes: [],
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }, [
    chat.data?.messages,
    streaming,
    optimisticUserMessage,
    pendingQuestion,
    createChat.isPending,
  ]);

  const lastAnswer = [...(chat.data?.messages ?? [])].reverse().find((m) => m.role === 'ASSISTANT');
  const offerThoroughSearch =
    !isStreaming &&
    lastAnswer?.answerStatus === 'NOT_FOUND' &&
    lastAnswer.mode === 'RETRIEVAL' &&
    lastAnswer.coverage?.complete === false;

  const isBusy = isStreaming || createChat.isPending;
  const chatList = chats.data ?? [];
  const currentChat = chatList.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Sleek Top Bar with New Analysis and History Drawer */}
      <div className="relative border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="truncate text-small font-semibold text-fg">
              {currentChat ? currentChat.title ?? 'Active Analysis' : 'New Analysis'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {chatList.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory((prev) => !prev)}
                className="h-8 gap-1.5 text-fg-muted hover:text-fg text-caption"
              >
                <History className="h-3.5 w-3.5" />
                <span>History ({chatList.length})</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActiveChatId(null);
                setShowHistory(false);
              }}
              className="h-8 gap-1 border-border text-primary hover:bg-primary-subtle text-caption"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </Button>
          </div>
        </div>

        {/* Dropdown Floating History Popover */}
        {showHistory && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1">
            <ChatHistoryList
              chats={chatList}
              activeChatId={activeChatId}
              onSelect={(id) => {
                setActiveChatId(id);
                setShowHistory(false);
              }}
              onNew={() => {
                setActiveChatId(null);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
            />
          </div>
        )}
      </div>

      {/* Main Conversation Stream */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-4">
        {chat.isError && (
          <ErrorState
            code={ApiError.isApiError(chat.error) ? chat.error.code : undefined}
            onRetry={() => void chat.refetch()}
          />
        )}

        {activeChatId !== null && chat.isPending && <LoadingState message={copy.common.loading} />}

        {/* High-End Welcome State with Instant Starter Questions */}
        {messages.length === 0 && !chat.isPending && !isBusy && (
          <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-body font-semibold text-fg">AI Contract Analyst</h3>
            <p className="max-w-xs mt-1 text-caption text-fg-muted">
              Every answer is verified against original document text with coordinate-accurate citation jumping.
            </p>

            <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 text-left">
              <span className="text-micro font-semibold uppercase tracking-wider text-fg-subtle">
                Suggested Prompts
              </span>
              {STARTER_PROMPTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(item.prompt, { thorough: item.thorough })}
                    className="group flex items-start gap-2.5 rounded-lg border border-border bg-surface-muted/60 p-2.5 transition-all hover:border-primary/40 hover:bg-surface-hover hover:shadow-xs"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform group-hover:scale-110" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-caption font-semibold text-fg">{item.title}</span>
                        <span className="rounded bg-primary-subtle px-1.5 py-0.5 text-micro font-medium text-primary">
                          {item.tag}
                        </span>
                      </div>
                      <span className="truncate text-caption text-fg-muted mt-0.5">
                        {item.prompt}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <MessageList
            messages={messages}
            onOpenQuote={onOpenQuote}
            progress={streaming?.progress ?? null}
            notices={streaming?.notices ?? []}
          />
        )}

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
              <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {copy.chat.searchWholeDocument}
            </Button>
          </div>
        )}
      </div>

      {/* Input Form */}
      <ChatInput
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={createChat.isPending}
      />
    </div>
  );
}
