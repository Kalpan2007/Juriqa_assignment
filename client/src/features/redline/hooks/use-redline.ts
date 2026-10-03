import { useMutation } from '@tanstack/react-query';
import { redlineApi } from '../api';

export function useCreateRedlinePlan() {
  return useMutation({
    mutationFn: ({ documentId, instruction }: { documentId: string; instruction: string }) =>
      redlineApi.createPlan(documentId, instruction),
  });
}

export function useApplyRedline() {
  return useMutation({
    mutationFn: ({ redlineId, acceptedEditIds }: { redlineId: string; acceptedEditIds: string[] }) =>
      redlineApi.apply(redlineId, acceptedEditIds),
  });
}
