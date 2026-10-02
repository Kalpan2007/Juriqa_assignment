import Link from 'next/link';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';

export default function NotFound() {
  return (
    <EmptyState
      title={copy.common.notFoundTitle}
      description={copy.common.notFoundDescription}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/">{copy.common.goToLibrary}</Link>
        </Button>
      }
    />
  );
}
