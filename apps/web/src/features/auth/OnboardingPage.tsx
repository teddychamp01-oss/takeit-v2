// Placeholder stub — the auth feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function OnboardingPage() {
  const t = useT();
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-cream">
      <PageHeader title={t('auth.onboardingTitle')} />
      <EmptyState
        title={t('auth.onboardingTitle')}
        body={t('auth.onboardingBody')}
      />
    </div>
  );
}
