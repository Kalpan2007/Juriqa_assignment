/**
 * Public entry point for the chat feature.
 * Other code imports from '@/features/chat' only, never its internal files (CLAUDE.md).
 */
export { ChatPanel } from './components/chat-panel';
export { ChatInput } from './components/chat-input';
export { QuoteChip } from './components/quote-chip';
export { CoverageLine, describeCoverage } from './components/coverage-line';
export { AnswerStatusBanner } from './components/answer-status-banner';
export { AnswerText } from './components/answer-text';
export { MessageList } from './components/message-list';
export { chatApi } from './api';
export {
  chatKeys,
  useChat,
  useChatsForDocument,
  useCreateChat,
  useSendMessage,
  streamingAsMessage,
} from './hooks/use-chat';
