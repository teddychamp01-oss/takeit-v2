import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

/** Mobile-first frame: content column (max-w-lg on larger screens) + bottom nav. */
export function AppShell() {
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-cream">
      <main className="pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
