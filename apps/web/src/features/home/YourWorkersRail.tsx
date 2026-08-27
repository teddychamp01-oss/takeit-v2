// N2c — "Your workers" compact rail (the rebook loop, us-A6 / asia-A.3):
// rebooking a worker you already trust must be easier than a saved phone
// number. Sits ABOVE 'Available Now' on Home for users with ≥1 saved worker.
//
// Renders NOTHING while loading, on failure, and when the list is empty (plan
// of record: "Empty → render nothing") — most users have no saved workers
// yet, so a skeleton here would promise a section that never arrives; and a
// failed fetch of this shortcut rail loses nothing (the saved list lives on
// the Me page), so it degrades to absence rather than an error card.
//
// Ordering: fetchSavedWorkers returns most-recently-saved first with a STABLE
// worker_id tiebreak; savedRailCards only caps (5) and reshapes — geography
// (or anything else) is never decided by the alphabet (repo law 1).
//
// Self-contained section component so it slots into the hero'd Home layout
// (harvest T2) without entangling the page.

import { useMemo } from 'react';
import { useLocale } from '../../lib/i18n';
import { WorkerCard } from '../../components/WorkerCard';
import { fetchSavedWorkers } from '../profile/api';
import { useAsync } from '../browse/useAsync';
import { SectionTitle } from '../browse/ui';
import { savedRailCards } from './logic';

export function YourWorkersRail({ userId }: { userId: string }) {
  const { t } = useLocale();
  const saved = useAsync(
    () => fetchSavedWorkers(userId),
    `home:savedWorkers:${userId}`,
  );
  const cards = useMemo(
    () => savedRailCards(saved.data?.rows ?? []),
    [saved.data],
  );

  if (cards.length === 0) return null;

  return (
    <section aria-label={t('home.yourWorkersSection')}>
      <SectionTitle>{t('home.yourWorkersSection')}</SectionTitle>
      {/* Edge-bleed horizontal rail of compact cards (same as Available Now). */}
      <ul className="-mx-4 flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
        {cards.map((card) => (
          <li key={card.id} className="shrink-0">
            <WorkerCard {...card} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}
