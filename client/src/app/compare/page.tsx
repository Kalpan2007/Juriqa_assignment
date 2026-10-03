import { PageHeader } from '@/components/layout/page-header';
import { VersionPicker } from '@/features/compare';
import { copy } from '@/content/copy';

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <PageHeader title={copy.compare.title} subtitle={copy.compare.subtitle} />
      <VersionPicker />
    </div>
  );
}
