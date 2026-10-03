'use client';

import { MessageSquare, Plus, Clock } from 'lucide-react';
import type { ChatSummaryDto } from '@ca/shared';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export function ChatHistoryList({
  chats,
  activeChatId,
  onSelect,
  onNew,
  onClose,
}: {
  chats: ChatSummaryDto[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNew: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-md animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-fg">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Previous Analyses ({chats.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onNew();
            onClose?.();
          }}
          className="h-7 gap-1 text-primary hover:text-primary-hover text-micro"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {copy.chat.newChat}
        </Button>
      </div>

      {chats.length === 0 ? (
        <p className="py-4 text-center text-caption text-fg-subtle">{copy.chat.historyEmpty}</p>
      ) : (
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto scrollbar-slim">
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(chat.id);
                    onClose?.();
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'group flex w-full flex-col items-start gap-1 rounded-lg px-2.5 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-primary-subtle text-primary border border-primary/20'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                  )}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-fg-subtle group-hover:text-primary" />
                    <span className="truncate text-small font-medium">
                      {chat.title ?? copy.chat.newChat}
                    </span>
                  </span>
                  <span className="text-micro text-fg-subtle">
                    {formatDateTime(chat.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
