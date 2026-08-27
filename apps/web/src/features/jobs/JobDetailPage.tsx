// Placeholder stub — the jobs feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function JobDetailPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('jobs.detailTitle')} back />
      <EmptyState title={t('jobs.detailTitle')} body={t('common.comingSoon')} />
    </div>
  );
}
