import {
  documentListSchema,
  documentSchema,
  documentLayoutSchema,
  pagesResponseSchema,
  documentHtmlSchema,
  uploadResponseSchema,
  type DocumentDto,
  type DocumentLayoutDto,
  type DocumentHtmlDto,
  type PagesResponseDto,
  type UploadResponseDto,
} from '@ca/shared';
import { z } from 'zod';
import { api, apiRequest } from '@/lib/api-client';

/**
 * Typed calls for the library feature. Every response is parsed with a schema from
 * `@ca/shared`, so a contract change surfaces here rather than as `undefined` in a component.
 */

const warningsSchema = z.object({ scannedPages: z.string().nullable() });

export const libraryApi = {
  list: () => api.get('/documents', documentListSchema).then((data) => data.documents),

  get: (id: string) => api.get(`/documents/${id}`, documentSchema),

  warnings: (id: string) => api.get(`/documents/${id}/warnings`, warningsSchema),

  upload: (file: File): Promise<UploadResponseDto> => {
    const body = new FormData();
    body.append('file', file);
    // Content-Type is left unset so the browser adds the multipart boundary itself.
    return apiRequest('/documents', { method: 'POST', body, schema: uploadResponseSchema });
  },

  remove: (id: string) => api.delete(`/documents/${id}`),

  layout: (id: string): Promise<DocumentLayoutDto> =>
    api.get(`/documents/${id}/layout`, documentLayoutSchema),

  pages: (id: string, from: number, to: number): Promise<PagesResponseDto> =>
    api.get(`/documents/${id}/pages?from=${from}&to=${to}`, pagesResponseSchema),

  html: (id: string): Promise<DocumentHtmlDto> =>
    api.get(`/documents/${id}/html`, documentHtmlSchema),

  /** Browser-navigable URL for the original file, used by the PDF viewer in F5. */
  fileUrl: (id: string) => api.url(`/documents/${id}/file`),
};

export type { DocumentDto };
