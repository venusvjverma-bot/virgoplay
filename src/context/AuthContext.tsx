import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Creator } from '../types';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  creator: Creator | null;
  loading: boolean;
  creatorFetchFailed: boolean;
  signOut: () => Promise<void>;
  refreshCreator: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

// Retries for up to ~4s regardless of error type.
// Network errors (ERR_INTERNET_DISCONNECTED) are transient and must be retried,
// not short-circuited. Only stops early when data is found.
async function fetchCreatorWithRetry(uid: string): Promise<Creator | null> {
  console.log('[AuthContext] fetchCreatorWithRetry uid=', uid);
  for (let i = 0; i < 8; i++) {
    try {
      const { data, error } = await supabase
        .from('creators').select('*').eq('id', uid).maybeSingle();
      console.log('[AuthContext] attempt', i + 1, '→', { found: !!data, err: error?.message ?? null });
      if (data) return data as Creator;
      // Non-fatal: row missing (insert race) or network error — keep retrying
    } catch (e) {
      console.warn('[AuthContext] attempt', i + 1, 'threw:', e);
    }
    if (i < 7) await new Promise(r => setTimeout(r, 500));
  }
  console.warn('[AuthContext] fetchCreatorWithRetry exhausted — returning null');
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]             = useState<Session | null>(null);
  const [creator, setCreator]             = useState<Creator | null>(null);
  const [loading, setLoading]             = useState(true);
  const [creatorFetchFailed, setFailed]   = useState(false);
  const initialized = useRef(false);
  const fetchingRef = useRef(false);
  const pendingUid  = useRef<string | null>(null);

  async function runFetch(uid: string) {
    if (fetchingRef.current) {
      pendingUid.current = uid;
      return;
    }
    fetchingRef.current = true;
    setFailed(false);
    try {
      const c = await fetchCreatorWithRetry(uid);
      setCreator(c);
      if (!c) setFailed(true);
    } finally {
      fetchingRef.current = false;
      if (!initialized.current) {
        initialized.current = true;
        console.log('[AuthContext] setLoading(false)');
        setLoading(false);
      }
      const next = pendingUid.current;
      if (next) { pendingUid.current = null; runFetch(next); }
    }
  }

  async function refreshCreator() {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data } = await supabase.from('creators').select('*').eq('id', uid).maybeSingle();
    setCreator(data as Creator ?? null);
    setFailed(!data);
  }

  useEffect(() => {
    console.log('[AuthContext] mounting');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[AuthContext] onAuthStateChange', event, s?.user?.id ?? 'none');
      setSession(s);
      if (s?.user) {
        runFetch(s.user.id);
      } else {
        setCreator(null);
        setFailed(false);
        if (!initialized.current) {
          initialized.current = true;
          setLoading(false);
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[AuthContext] getSession resolved, uid=', s?.user?.id ?? 'none', 'initialized=', initialized.current);
      if (!initialized.current && !s?.user) {
        initialized.current = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Realtime: detect deactivation while the creator is logged in ──────────────
  useEffect(() => {
    if (!creator?.id) return;

    const channel = supabase
      .channel(`creator-${creator.id}-deactivation`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'creators', filter: `id=eq.${creator.id}` },
        (payload) => {
          const updated = payload.new as Creator;
          if (updated.is_temporarily_deactivated !== creator.is_temporarily_deactivated) {
            setCreator(updated);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [creator?.id]);

  async function signOut() {
    setCreator(null);
    setFailed(false);
    await supabase.auth.signOut();
  }

  console.log('[AuthContext] render — loading=', loading, '| session=', !!session, '| creator=', creator ? `@${creator.username}` : 'null', '| failed=', creatorFetchFailed);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, creator, loading, creatorFetchFailed, signOut, refreshCreator }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
