// Placeholder stub — the profile feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function WorkerProfileEditPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('profile.workerProfileTitle')} back />
      <EmptyState
        title={t('profile.workerProfileTitle')}
        body={t('common.comingSoon')}
      />
    </div>
  );
}
