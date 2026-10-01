import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { parseAuthCallback } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  userId: string | null;
  initializing: boolean;
  /** True after a password-recovery link has established a session. */
  recovery: boolean;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function consumeAuthUrl(url: string | null, onRecovery: () => void) {
  const parsed = parseAuthCallback(url);
  if (!parsed) return;
  if (parsed.type === 'recovery') onRecovery();
  if (parsed.code) {
    await supabase.auth.exchangeCodeForSession(parsed.code);
    return;
  }
  if (parsed.accessToken && parsed.refreshToken) {
    await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      await consumeAuthUrl(initialUrl, () => {
        if (mounted) setRecovery(true);
      });
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    })();

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void consumeAuthUrl(url, () => setRecovery(true));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    return () => {
      mounted = false;
      linkSub.remove();
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      initializing,
      recovery,
      clearRecovery: () => setRecovery(false),
      signOut: async () => {
        setRecovery(false);
        await supabase.auth.signOut();
      },
    }),
    [session, initializing, recovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
