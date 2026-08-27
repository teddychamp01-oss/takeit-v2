import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { StaleBanner } from './StaleBanner';
import { ToastProvider } from './Toast';

/**
 * Mobile-first frame: content column (max-w-lg on larger screens) + bottom
 * nav. ToastProvider lives here so every page under the shell can call
 * useToast() and the toast stack sits above the BottomNav it knows about.
 * StaleBanner is mounted ONCE here (N4): while offline, every page is
 * labelled as showing saved data.
 */
export function AppShell() {
  return (
    <ToastProvider>
      <div className="mx-auto min-h-screen max-w-lg bg-cream">
        <StaleBanner />
        <main className="pb-24">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
