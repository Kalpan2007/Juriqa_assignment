/**
 * Public entry point for the library feature.
 * Other code imports from '@/features/library' only, never its internal files (CLAUDE.md).
 */
export { DocumentLibrary } from './components/document-library';
export { DocumentStatusBadge } from './components/document-status-badge';
export { libraryApi } from './api';
export {
  documentKeys,
  useDocument,
  useDocuments,
  useDocumentWarnings,
  useDeleteDocument,
  useUploadDocument,
} from './hooks/use-documents';
