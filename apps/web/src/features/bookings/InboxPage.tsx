// Placeholder stub — the bookings feature agent replaces this file.
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function InboxPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('bookings.inboxTitle')} />
      <EmptyState
        title={t('bookings.inboxTitle')}
        body={t('common.comingSoon')}
      />
    </div>
  );
}
