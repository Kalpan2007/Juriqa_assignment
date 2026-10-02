'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

/**
 * The question box.
 *
 * While an answer is streaming the input is disabled and the Send button becomes Stop
 * (ARCHITECTURE section 7): a second question sent mid-answer would interleave two streams
 * into one message. Stop is always reachable, which is what makes the disabled input
 * acceptable rather than a trap.
 */
export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = value.trim();
    if (content.length === 0 || isStreaming || disabled) return;
    onSend(content);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line, as in any chat.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-border bg-surface p-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isStreaming || disabled}
        rows={2}
        placeholder={isStreaming ? copy.chat.inputDisabledWhileStreaming : copy.chat.placeholder}
        aria-label={copy.chat.placeholder}
        className="min-w-0 flex-1 resize-none rounded-md border border-border bg-bg px-3 py-2 text-body text-fg placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-60"
      />

      {isStreaming ? (
        <Button type="button" variant="secondary" onClick={onStop}>
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.chat.stop}
        </Button>
      ) : (
        <Button type="submit" disabled={value.trim().length === 0 || disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {copy.chat.send}
        </Button>
      )}
    </form>
  );
}
