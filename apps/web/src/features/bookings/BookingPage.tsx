// Placeholder stub — the bookings feature agent replaces this file.
// (Job-scoped chat + MaskedPhone reveal-on-confirmation live here — SPEC C3.)
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function BookingPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('bookings.bookingTitle')} back />
      <EmptyState
        title={t('bookings.bookingTitle')}
        body={t('common.comingSoon')}
      />
    </div>
  );
}
