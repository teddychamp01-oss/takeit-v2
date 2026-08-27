// Placeholder stub — the browse feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function WorkerDetailPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('browse.workerTitle')} back />
      <EmptyState
        title={t('browse.workerTitle')}
        body={t('common.comingSoon')}
      />
    </div>
  );
}
