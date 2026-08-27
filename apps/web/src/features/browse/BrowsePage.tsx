// Placeholder stub — the browse feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function BrowsePage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('browse.title')} />
      <EmptyState title={t('browse.title')} body={t('common.comingSoon')} />
    </div>
  );
}
