'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { BookOpen, Send, Square, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: {
  onSend: (content: string, options?: { thorough: boolean }) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const [thorough, setThorough] = useState(false);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = value.trim();
    if (content.length === 0 || isStreaming || disabled) return;
    onSend(content, { thorough });
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 border-t border-border bg-surface p-3.5">
      {/* Mode Selector Segmented Pill */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
          <button
            type="button"
            onClick={() => setThorough(false)}
            disabled={isStreaming || disabled}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-caption font-medium transition-all ${
              !thorough ? 'bg-surface text-primary shadow-xs' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <Zap className="h-3 w-3 text-amber-500" />
            <span>Fast Retrieval</span>
          </button>
          <button
            type="button"
            onClick={() => setThorough(true)}
            disabled={isStreaming || disabled}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-caption font-medium transition-all ${
              thorough ? 'bg-surface text-primary shadow-xs' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <BookOpen className="h-3 w-3 text-indigo-500" />
            <span>Thorough Scan (Whole Document)</span>
          </button>
        </div>

        <span className="text-micro text-fg-subtle">
          {thorough ? 'Audit all pages (Proves absence)' : 'Targeted clause search'}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || disabled}
          rows={2}
          placeholder={isStreaming ? copy.chat.inputDisabledWhileStreaming : 'Ask a question about this contract (e.g. commitments, termination, governing law)...'}
          aria-label={copy.chat.placeholder}
          className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-body text-fg placeholder:text-fg-subtle focus:border-primary focus:bg-surface focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
        />

        {isStreaming ? (
          <Button type="button" variant="secondary" onClick={onStop} className="h-10 gap-1.5">
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.chat.stop}
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={value.trim().length === 0 || disabled}
            className="h-10 gap-1.5 bg-primary text-primary-fg hover:bg-primary-hover shadow-xs"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {copy.chat.send}
          </Button>
        )}
      </div>
    </form>
  );
}
