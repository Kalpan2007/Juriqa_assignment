import { z } from 'zod';

/** Matches the Prisma enums in ARCHITECTURE section 2. */
export const DOCUMENT_KINDS = ['PDF', 'DOCX'] as const;
export const DOCUMENT_STATUSES = [
  'UPLOADED',
  'EXTRACTING',
  'INDEXING',
  'READY',
  'FAILED',
] as const;

export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

export type DocumentKind = z.infer<typeof documentKindSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Statuses the UI should stop polling on. */
export const FINAL_DOCUMENT_STATUSES: readonly DocumentStatus[] = ['READY', 'FAILED'];

export function isFinalStatus(status: DocumentStatus): boolean {
  return FINAL_DOCUMENT_STATUSES.includes(status);
}

/**
 * A document as the library and workspace see it.
 * `fullText` is deliberately NOT exposed — offsets are resolved server-side, and the viewer
 * fetches page text through the paginated endpoints (decision D20).
 */
export const documentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: documentKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: documentStatusSchema,
  /** Human-readable progress, e.g. "Extracting page 42 of 150". */
  statusDetail: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  pageCount: z.number().int().positive().nullable(),
  /** Pages with no readable text; drives the partial-scan warning (decision D10). */
  scannedPageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DocumentDto = z.infer<typeof documentSchema>;

export const documentListSchema = z.object({
  documents: z.array(documentSchema),
});

export type DocumentListDto = z.infer<typeof documentListSchema>;

/** Response to a successful upload. */
export const uploadResponseSchema = z.object({
  document: documentSchema,
  /** Set when an identical file (same sha256) already exists — the UI shows a hint, not an error. */
  duplicateOfName: z.string().nullable().optional(),
});

export type UploadResponseDto = z.infer<typeof uploadResponseSchema>;

// ---------------------------------------------------------------------------
// Viewer payloads (decision D20: never one huge document-wide response)
// ---------------------------------------------------------------------------

/** One page's geometry, enough to size a placeholder before its content is fetched. */
export const pageLayoutSchema = z.object({
  number: z.number().int().positive(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  isScanned: z.boolean(),
});

export type PageLayoutDto = z.infer<typeof pageLayoutSchema>;

export const documentLayoutSchema = z.object({
  documentId: z.uuid(),
  kind: documentKindSchema,
  pageCount: z.number().int().nonnegative(),
  textLength: z.number().int().nonnegative(),
  pages: z.array(pageLayoutSchema),
});

export type DocumentLayoutDto = z.infer<typeof documentLayoutSchema>;

/**
 * A text item as stored, in compact array form to keep payloads small:
 * `[start, end, x, y, w, h, eol]`. The item's string is `pageText.slice(start - pageStart, ...)`,
 * never stored separately — `fullText` stays the single source of truth (principle 3).
 */
export const compactItemSchema = z.tuple([
  z.number(), // start offset in fullText
  z.number(), // end offset in fullText
  z.number(), // x (PDF units)
  z.number(), // y
  z.number(), // width
  z.number(), // height
  z.number(), // hasEOL as 0 | 1
]);

export type CompactItem = z.infer<typeof compactItemSchema>;

export const pageContentSchema = z.object({
  number: z.number().int().positive(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  isScanned: z.boolean(),
  /** The page's slice of fullText, so the client can reconstruct item strings. */
  text: z.string(),
  items: z.array(compactItemSchema),
});

export type PageContentDto = z.infer<typeof pageContentSchema>;

export const pagesResponseSchema = z.object({
  documentId: z.uuid(),
  pages: z.array(pageContentSchema),
});

export type PagesResponseDto = z.infer<typeof pagesResponseSchema>;

/** Maximum pages one `/pages` request may ask for (decision D20). */
export const MAX_PAGES_PER_REQUEST = 10;

export const pagesQuerySchema = z
  .object({
    from: z.coerce.number().int().positive(),
    to: z.coerce.number().int().positive(),
  })
  .refine((q) => q.to >= q.from, { message: 'to must be greater than or equal to from' })
  .refine((q) => q.to - q.from + 1 <= MAX_PAGES_PER_REQUEST, {
    message: `At most ${MAX_PAGES_PER_REQUEST} pages per request`,
  });

export type PagesQuery = z.infer<typeof pagesQuerySchema>;

/** DOCX reading view: server-sanitised HTML with data-start/data-end on every block. */
export const documentHtmlSchema = z.object({
  documentId: z.uuid(),
  html: z.string(),
  textLength: z.number().int().nonnegative(),
});

export type DocumentHtmlDto = z.infer<typeof documentHtmlSchema>;
