// Role gate for admin/ops surfaces.
//
// AUTHORITY LIVES SERVER-SIDE (SPEC C8): every admin capability is enforced
// by RLS policies backed by the SECURITY DEFINER has_role() function. RLS on
// user_roles only ever returns the CALLER'S OWN rows, so this client check
// cannot be spoofed into seeing another user's roles — and even a tampered
// client that renders the page gets nothing back from the database. This
// component is UX (don't show dead screens), not security.

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { useT } from '../lib/i18n';
import { EmptyState } from './EmptyState';
import { SpinnerBlock } from './Spinner';

export type AppRole = 'admin' | 'ops' | 'support';

export function RequireRole({
  roles,
  children,
}: {
  /** The user must hold at least one of these roles. */
  roles: readonly AppRole[];
  children: ReactNode;
}) {
  const { user, loading } = useSession();
  const t = useT();
  const [userRoles, setUserRoles] = useState<AppRole[] | null>(null);

  useEffect(() => {
    if (!user) {
      setUserRoles([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setUserRoles([]); // fail CLOSED — an error never grants access
          return;
        }
        setUserRoles(data.map((row) => row.role as AppRole));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || userRoles === null) return <SpinnerBlock />;

  const allowed = userRoles.some((role) => roles.includes(role));
  if (!allowed) {
    return <EmptyState title={t('admin.accessDenied')} />;
  }
  return <>{children}</>;
}
