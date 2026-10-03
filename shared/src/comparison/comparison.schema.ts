import { z } from 'zod';

export const CHANGE_TYPES = ['ADDED', 'REMOVED', 'MODIFIED', 'MOVED', 'UNCHANGED'] as const;
export const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export const changeTypeSchema = z.enum(CHANGE_TYPES);
export const severitySchema = z.enum(SEVERITIES);

export type ChangeType = z.infer<typeof changeTypeSchema>;
export type Severity = z.infer<typeof severitySchema>;

export const createComparisonSchema = z.object({
  baseDocumentId: z.string().uuid(),
  revisedDocumentId: z.string().uuid(),
});

export type CreateComparisonInput = z.infer<typeof createComparisonSchema>;

export const comparisonClauseSchema = z.object({
  ref: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
});

export type ComparisonClauseDto = z.infer<typeof comparisonClauseSchema>;

export const comparisonChangeSchema = z.object({
  id: z.string(),
  type: changeTypeSchema,
  severity: severitySchema,
  baseClause: comparisonClauseSchema.nullable(),
  revisedClause: comparisonClauseSchema.nullable(),
  summary: z.string(),
  rationale: z.string().nullable().optional(),
  detectorReasons: z.array(z.string()),
});

export type ComparisonChangeDto = z.infer<typeof comparisonChangeSchema>;

export const comparisonCountsSchema = z.object({
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type ComparisonCountsDto = z.infer<typeof comparisonCountsSchema>;

export const comparisonResultSchema = z.object({
  id: z.string(),
  baseDocumentId: z.string().uuid(),
  baseDocumentName: z.string(),
  revisedDocumentId: z.string().uuid(),
  revisedDocumentName: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
  counts: comparisonCountsSchema,
  renumberNote: z.string().nullable().optional(),
  differentContractsWarning: z.boolean().optional(),
  changes: z.array(comparisonChangeSchema),
  createdAt: z.string(),
});

export type ComparisonResultDto = z.infer<typeof comparisonResultSchema>;

export const comparisonSummarySchema = z.object({
  id: z.string(),
  baseDocumentId: z.string().uuid(),
  baseDocumentName: z.string(),
  revisedDocumentId: z.string().uuid(),
  revisedDocumentName: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
  counts: comparisonCountsSchema.nullable(),
  createdAt: z.string(),
});

export type ComparisonSummaryDto = z.infer<typeof comparisonSummarySchema>;
