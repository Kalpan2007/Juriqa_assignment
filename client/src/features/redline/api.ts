import {
  redlinePlanResponseSchema,
  applyRedlineResponseSchema,
  type RedlinePlanResponseDto,
  type ApplyRedlineResponseDto,
} from '@ca/shared';
import { api } from '@/lib/api-client';

export const redlineApi = {
  createPlan: (documentId: string, instruction: string): Promise<RedlinePlanResponseDto> =>
    api.post(`/documents/${documentId}/redlines`, { instruction }, redlinePlanResponseSchema),

  apply: (redlineId: string, acceptedEditIds: string[]): Promise<ApplyRedlineResponseDto> =>
    api.post(`/redlines/${redlineId}/apply`, { acceptedEditIds }, applyRedlineResponseSchema),

  downloadUrl: (redlineId: string): string => api.url(`/redlines/${redlineId}/download`),
};
