// N4 — the visible half of offline-tolerant reads (repo law 6: stale data
// must SAY it is stale). Mounted ONCE in AppShell; while the device is
// offline every page under the shell shows the same slim am-first line, so
// anything rendered from the service-worker cache is labelled saved data.
// Self-contained: navigator.onLine + online/offline events, no store.

import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';

function readOnline(): boolean {
  // Environments without the API (very old WebViews, jsdom quirks) are
  // treated as online — the banner fails SILENT, never false-alarms.
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function StaleBanner() {
  const t = useT();
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-1.5 bg-ink px-4 py-1.5 text-center text-xs font-semibold text-white"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {/* cloud-off */}
        <path d="M6.5 18.5h9.75a3.75 3.75 0 001-7.36 5.5 5.5 0 00-9.03-3.4M4.6 7.3A4.5 4.5 0 006.5 18.5" />
        <path d="M3 3l18 18" />
      </svg>
      {t('common.offlineShowingSaved')}
    </div>
  );
}
