/**
 * Public entry point for the redline feature — built in slice F8.
 * Other code imports from '@/features/redline' only, never from its internal files (CLAUDE.md).
 */
export * from './api';
export * from './hooks/use-redline';
export * from './components/instruction-form';
export * from './components/proposed-edit-list';
