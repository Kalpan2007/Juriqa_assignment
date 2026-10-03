import { z } from 'zod';

export const REDLINE_REJECTION_REASONS = [
  'NOT_FOUND',
  'AMBIGUOUS',
  'CROSS_PARAGRAPH',
  'HAS_EXISTING_REVISIONS',
  'OVERLAPS',
  'NO_OP',
  'OUT_OF_SCOPE',
] as const;

export const redlineRejectionReasonSchema = z.enum(REDLINE_REJECTION_REASONS);
export type RedlineRejectionReason = z.infer<typeof redlineRejectionReasonSchema>;

export const REDLINE_EDIT_STATUSES = ['APPLICABLE', 'REJECTED'] as const;
export const redlineEditStatusSchema = z.enum(REDLINE_EDIT_STATUSES);
export type RedlineEditStatus = z.infer<typeof redlineEditStatusSchema>;

export const redlineEditSchema = z.object({
  id: z.string(),
  find: z.string(),
  replace: z.string(),
  reason: z.string(),
  status: redlineEditStatusSchema,
  rejectionReason: z.string().optional(),
  clauseRef: z.string().nullable().optional(),
  paragraphIndex: z.number().int().nonnegative().optional(),
});

export type RedlineEditDto = z.infer<typeof redlineEditSchema>;

export const createRedlinePlanSchema = z.object({
  instruction: z.string().min(1, 'Please enter an instruction.').max(2000),
});

export type CreateRedlinePlanInput = z.infer<typeof createRedlinePlanSchema>;

export const redlinePlanResponseSchema = z.object({
  redlineId: z.string(),
  documentId: z.string(),
  instruction: z.string(),
  edits: z.array(redlineEditSchema),
  createdAt: z.string(),
});

export type RedlinePlanResponseDto = z.infer<typeof redlinePlanResponseSchema>;

export const applyRedlineSchema = z.object({
  acceptedEditIds: z.array(z.string()),
});

export type ApplyRedlineInput = z.infer<typeof applyRedlineSchema>;

export const applyRedlineResponseSchema = z.object({
  redlineId: z.string(),
  appliedCount: z.number().int().nonnegative(),
  downloadUrl: z.string(),
});

export type ApplyRedlineResponseDto = z.infer<typeof applyRedlineResponseSchema>;
