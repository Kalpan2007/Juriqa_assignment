'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { MessageDto, QuoteDto } from '@ca/shared';
import { resolveErrorMessage } from '@/content/error-messages';
import { copy } from '@/content/copy';
import { cn } from '@/lib/cn';
import { AnswerStatusBanner } from './answer-status-banner';
import { AnswerText } from './answer-text';
import { CoverageLine } from './coverage-line';
import { QuoteChip } from './quote-chip';

/**
 * The conversation. One component renders both saved and streaming messages, so an answer
 * does not visibly change shape the moment it finishes.
 */
export function MessageList({
  messages,
  showDocumentNames = false,
  onOpenQuote,
  progress,
  notices,
}: {
  messages: MessageDto[];
  showDocumentNames?: boolean;
  onOpenQuote?: (quote: QuoteDto) => void;
  progress?: { done: number; total: number; label: string } | null;
  notices?: Array<{ code: string; message: string }>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];

  // Follow the answer as it streams. Keyed on length and content so each delta scrolls.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastMessage?.content]);

  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) =>
        message.role === 'USER' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            showDocumentNames={showDocumentNames}
            onOpenQuote={onOpenQuote}
            progress={progress}
            notices={notices}
          />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

function UserMessage({ message }: { message: MessageDto }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-2xl rounded-tr-xs bg-primary px-4 py-2.5 text-body text-primary-fg shadow-xs leading-relaxed"
        style={{ maxWidth: 'var(--layout-message-max)' }}
      >
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  showDocumentNames,
  onOpenQuote,
  progress,
  notices,
}: {
  message: MessageDto;
  showDocumentNames: boolean;
  onOpenQuote?: (quote: QuoteDto) => void;
  progress?: { done: number; total: number; label: string } | null;
  notices?: Array<{ code: string; message: string }>;
}) {
  const isStreaming = message.status === 'STREAMING';
  const hasText = message.content.trim().length > 0;

  return (
    <div className="flex flex-col">
      <AnswerStatusBanner status={message.answerStatus} />

      {/* A rate-limit retry or an unreadable quote payload: the answer continues. */}
      {notices?.map((notice, index) => (
        <div
          key={index}
          className="mb-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-fg-muted"
        >
          {notice.message}
        </div>
      ))}

      {/* Real counts during a thorough read, never a bare spinner. */}
      {progress !== null && progress !== undefined && (
        <div className="mb-2 flex items-center gap-2 text-caption text-fg-muted">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          <span>
            {progress.label} ({progress.done}/{progress.total})
          </span>
        </div>
      )}

      {message.status === 'ERROR' ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-small text-fg">
          {resolveErrorMessage(message.errorCode ?? undefined).description}
        </div>
      ) : (
        <div
          // Announce the answer as it streams, without interrupting the reader.
          aria-live={isStreaming ? 'polite' : 'off'}
          aria-busy={isStreaming}
        >
          {/* Animated Thinking State when stream or pending question is active before first token */}
          {isStreaming && !hasText && (
            <div className="flex flex-col gap-2.5 py-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary animate-pulse">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-small font-medium text-fg">
                    {message.mode === 'THOROUGH' ? 'Scanning All Pages' : 'Analyzing Contract'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
              <div className="ml-9 rounded-lg border border-border bg-surface-muted/60 px-3.5 py-2 text-caption text-fg-muted">
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <span>
                    {message.mode === 'THOROUGH'
                      ? 'Scanning entire agreement pages to verify clauses & prove absence...'
                      : 'Retrieving relevant clauses, cross-referencing citations & verifying quotes...'}
                  </span>
                </p>
              </div>
            </div>
          )}

          {hasText && (
            <>
              <AnswerText
                text={message.content}
                quotes={message.quotes}
                onOpenQuote={onOpenQuote}
              />
              {isStreaming && (
                <span
                  className={cn('ml-1 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle')}
                  aria-hidden="true"
                />
              )}
            </>
          )}
        </div>
      )}

      {message.status === 'STOPPED' && (
        <span className="mt-1 text-caption text-fg-muted">{copy.chat.stopped}</span>
      )}

      {/* Quotes arrive only after verification, which is why they appear below the text. */}
      {message.quotes.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {message.quotes.map((quote) => (
            <QuoteChip
              key={`${quote.id}-${quote.citation}`}
              quote={quote}
              showDocumentName={showDocumentNames || (message.documentCoverage?.length ?? 0) > 0}
              onOpen={onOpenQuote}
            />
          ))}
        </div>
      )}

      <CoverageLine
        coverage={message.coverage}
        documentCoverage={message.documentCoverage}
        answerText={message.content}
      />
    </div>
  );
}
