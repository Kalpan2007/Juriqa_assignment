import {
  comparisonResultSchema,
  type ComparisonResultDto,
} from '@ca/shared';
import { api } from '@/lib/api-client';

export const compareApi = {
  create: (baseDocumentId: string, revisedDocumentId: string): Promise<ComparisonResultDto> =>
    api.post('/comparisons', { baseDocumentId, revisedDocumentId }, comparisonResultSchema),

  get: (id: string): Promise<ComparisonResultDto> =>
    api.get(`/comparisons/${id}`, comparisonResultSchema),
};
