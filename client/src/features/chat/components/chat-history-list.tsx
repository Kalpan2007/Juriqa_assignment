'use client';

import { MessageSquare, Plus } from 'lucide-react';
import type { ChatSummaryDto } from '@ca/shared';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Previous chats for this document, most recent first (decision D21). */
export function ChatHistoryList({
  chats,
  activeChatId,
  onSelect,
  onNew,
}: {
  chats: ChatSummaryDto[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-fg-muted">{copy.chat.history}</span>
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.chat.newChat}
        </Button>
      </div>

      {chats.length === 0 ? (
        <p className="text-caption text-fg-subtle">{copy.chat.historyEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                onClick={() => onSelect(chat.id)}
                aria-current={chat.id === activeChatId ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
                  chat.id === activeChatId
                    ? 'bg-primary-subtle text-primary'
                    : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate text-small">{chat.title ?? copy.chat.newChat}</span>
                </span>
                <span className="pl-5 text-caption text-fg-subtle">
                  {formatDateTime(chat.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
