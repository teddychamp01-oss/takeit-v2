// Placeholder stub — the jobs feature agent replaces this file.
// (Two-location model + diaspora toggle live here — SPEC frontend rules.)
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function PostJobPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('jobs.postTitle')} back />
      <EmptyState title={t('jobs.postTitle')} body={t('common.comingSoon')} />
    </div>
  );
}
