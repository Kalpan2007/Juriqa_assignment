import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query defaults.
 *
 * `retry: 1` rather than the default 3: most failures here are deliberate 4xx errors with a
 * message worth showing (unsupported file type, document not ready), and retrying those just
 * delays the message the user needs to see.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
