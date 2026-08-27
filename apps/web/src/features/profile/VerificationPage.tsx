// Placeholder stub — the verification feature agent replaces this file.
// (Manual-ID upload path; Fayda eSignet behind FEATURE_FAYDA_ENABLED — C2.)
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function VerificationPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('verification.title')} back />
      <EmptyState
        title={t('verification.title')}
        body={t('common.comingSoon')}
      />
    </div>
  );
}
