// Placeholder stub — the home feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';

export default function HomePage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('common.appName')} action={<LocaleSwitcher />} />
      <EmptyState title={t('home.greeting')} body={t('common.tagline')} />
    </div>
  );
}
