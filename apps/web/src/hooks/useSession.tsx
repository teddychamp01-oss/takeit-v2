// One auth subscription for the whole app (React context — no state library).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface SessionState {
  session: Session | null;
  user: User | null;
  /** True until the first getSession()/auth event resolves. */
  loading: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setState({ session, user: session?.user ?? null, loading: false });
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
