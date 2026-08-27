import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { SpinnerBlock } from './Spinner';

/** Gate: unauthenticated users are sent to /auth (with a return path). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return <SpinnerBlock />;
  if (!session) {
    return (
      <Navigate to="/auth" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}
