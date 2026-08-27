import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ToastProvider } from './Toast';

/**
 * Mobile-first frame: content column (max-w-lg on larger screens) + bottom
 * nav. ToastProvider lives here so every page under the shell can call
 * useToast() and the toast stack sits above the BottomNav it knows about.
 */
export function AppShell() {
  return (
    <ToastProvider>
      <div className="mx-auto min-h-screen max-w-lg bg-cream">
        <main className="pb-24">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
