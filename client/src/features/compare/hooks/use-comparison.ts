import { useMutation, useQuery } from '@tanstack/react-query';
import { compareApi } from '../api';
import type { ComparisonResultDto } from '@ca/shared';

export function useComparison(id: string | null | undefined) {
  return useQuery<ComparisonResultDto>({
    queryKey: ['comparison', id],
    queryFn: () => (id ? compareApi.get(id) : Promise.reject(new Error('No comparison id'))),
    enabled: Boolean(id),
  });
}

export function useCreateComparison() {
  return useMutation({
    mutationFn: ({
      baseDocumentId,
      revisedDocumentId,
    }: {
      baseDocumentId: string;
      revisedDocumentId: string;
    }) => compareApi.create(baseDocumentId, revisedDocumentId),
  });
}
