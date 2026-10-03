'use client';

import { useMemo, useState } from 'react';
import { FileText, Layers, RefreshCw } from 'lucide-react';
import { MAX_CHAT_DOCUMENTS, type DocumentDto, type MessageDto, type QuoteDto } from '@ca/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { useDocuments } from '@/features/library';
import { ChatInput, MessageList, useChat, useSendMessage, streamingAsMessage, chatApi } from '@/features/chat';
import { copy } from '@/content/copy';

export function MultiDocChat() {
  const documentsQuery = useDocuments();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const readyDocuments = useMemo(() => {
    return (documentsQuery.data ?? []).filter((doc: DocumentDto) => doc.status === 'READY');
  }, [documentsQuery.data]);

  const chat = useChat(activeChatId);
  const { send, stop, streaming, isStreaming, optimisticUserMessage } = useSendMessage(
    activeChatId,
    selectedIds[0] ?? '',
  );

  const toggleDocument = (id: string) => {
    if (activeChatId !== null) return; // Locked once chat is created
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= MAX_CHAT_DOCUMENTS) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleStartChat = async () => {
    if (selectedIds.length < 2) return;
    setIsCreatingChat(true);
    setCreateError(null);
    try {
      const created = await chatApi.create(selectedIds);
      setActiveChatId(created.id);
    } catch {
      setCreateError('Could not start multi-document chat. Please try again.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleReset = () => {
    setActiveChatId(null);
    setSelectedIds([]);
  };

  const messages = useMemo<MessageDto[]>(() => {
    const saved = chat.data?.messages ?? [];
    const result = [...saved];

    if (optimisticUserMessage) {
      const alreadySaved = saved.some(
        (m) => m.role === 'USER' && m.content === optimisticUserMessage.content,
      );
      if (!alreadySaved) {
        result.push(optimisticUserMessage);
      }
    }

    if (streaming !== null) {
      result.push(streamingAsMessage(streaming));
    }

    return result;
  }, [chat.data?.messages, streaming, optimisticUserMessage]);

  const handleSend = (content: string) => {
    if (activeChatId === null) return;
    void send(content);
  };

  const handleOpenQuote = (quote: QuoteDto) => {
    if (quote.documentId) {
      window.open(`/documents/${quote.documentId}?quote=${quote.citation}`, '_blank');
    }
  };

  return (
    <div
      className="flex flex-col rounded-card border border-border bg-surface"
      style={{ height: 'calc(100vh - 140px)', minHeight: 500 }}
    >
      {/* Top Header / Document Selector Strip */}
      <div className="border-b border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-body font-semibold text-fg">
              {activeChatId === null ? copy.multiDoc.title : `${copy.multiDoc.title} (${selectedIds.length} documents)`}
            </h2>
          </div>

          {activeChatId !== null ? (
            <Button variant="secondary" size="sm" onClick={handleReset} className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              New multi-doc chat
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={selectedIds.length < 2 || isCreatingChat}
              onClick={handleStartChat}
            >
              {isCreatingChat ? 'Starting…' : copy.multiDoc.ask}
            </Button>
          )}
        </div>

        {/* Selected or Selectable Documents */}
        {activeChatId === null ? (
          <div className="mt-4">
            <p className="mb-2 text-caption text-fg-muted">
              Select 2 to 5 ready contracts to compare:
            </p>
            {readyDocuments.length === 0 ? (
              <p className="text-caption italic text-fg-muted">
                No ready documents in the library. Upload documents first.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {readyDocuments.map((doc: DocumentDto) => {
                  const isSelected = selectedIds.includes(doc.id);
                  const selectedIndex = selectedIds.indexOf(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDocument(doc.id)}
                      className={`flex items-center justify-between rounded-md border p-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary-subtle text-fg font-medium'
                          : 'border-border bg-surface hover:bg-surface-hover text-fg-muted'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-fg-subtle" />
                        <span className="truncate text-small">{doc.name}</span>
                      </div>
                      {isSelected && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-white">
                          D{selectedIndex + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {createError && <p className="mt-2 text-caption text-danger">{createError}</p>}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chat.data?.documents.map((doc) => (
              <span
                key={doc.documentId}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-caption text-fg"
              >
                <span className="font-bold text-primary">{doc.alias}:</span>
                <span className="truncate" style={{ maxWidth: 200 }}>
                  {doc.name}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-4">
        {activeChatId === null ? (
          <EmptyState
            icon={<Layers className="h-8 w-8" />}
            title={copy.multiDoc.empty.title}
            description={copy.multiDoc.empty.description}
          />
        ) : chat.isPending ? (
          <LoadingState message={copy.common.loading} />
        ) : chat.isError ? (
          <ErrorState onRetry={() => void chat.refetch()} />
        ) : (
          <MessageList
            messages={messages}
            showDocumentNames={true}
            onOpenQuote={handleOpenQuote}
            progress={streaming?.progress ?? null}
            notices={streaming?.notices ?? []}
          />
        )}
      </div>

      {/* Input bar */}
      {activeChatId !== null && (
        <div className="border-t border-border bg-surface p-4">
          <ChatInput
            onSend={handleSend}
            onStop={stop}
            isStreaming={isStreaming}
          />
        </div>
      )}
    </div>
  );
}
