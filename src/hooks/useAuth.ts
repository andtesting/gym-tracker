import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase';

// Recovery intent is persisted so it survives a page reload. The Supabase
// recovery session itself is persisted in localStorage, so without a durable
// flag a reload would re-read that session, miss the one-shot PASSWORD_RECOVERY
// event, and drop the user straight into the app without setting a password.
const RECOVERY_KEY = 'gym-tracker-password-recovery';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // True while the user arrived via a password-recovery link and has not yet
  // set a new password. Forces the reset screen instead of the app, so a
  // recovery link can't be used as a silent passwordless login.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      // Re-derive recovery on load: a persisted recovery session + the durable
      // flag means the user still hasn't set a new password.
      if (data.session && localStorage.getItem(RECOVERY_KEY)) setRecovery(true);
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        localStorage.setItem(RECOVERY_KEY, '1');
        setRecovery(true);
      } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // A normal sign-in or sign-out is not a recovery; clear the flag.
        localStorage.removeItem(RECOVERY_KEY);
        setRecovery(false);
      }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearRecovery = useCallback(() => {
    localStorage.removeItem(RECOVERY_KEY);
    setRecovery(false);
  }, []);

  return { session, loading, recovery, clearRecovery };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://andtesting.github.io/gym-tracker/',
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
