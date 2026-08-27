// Placeholder stub — the profile feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';

export default function MePage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('profile.meTitle')} action={<LocaleSwitcher />} />
      <EmptyState title={t('profile.meTitle')} body={t('common.comingSoon')} />
    </div>
  );
}
