'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/feedback';

/**
 * Route-level error boundary. The message comes from the error CODE where one exists, so the
 * wording matches the rest of the app rather than exposing a raw framework message.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
