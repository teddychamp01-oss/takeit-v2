// Placeholder stub — the jobs feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function MyJobsPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('jobs.myJobsTitle')} />
      <EmptyState title={t('jobs.myJobsTitle')} body={t('common.comingSoon')} />
    </div>
  );
}
