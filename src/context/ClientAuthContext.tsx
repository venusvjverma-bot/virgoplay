import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client } from '../types';

const STORAGE_KEY = 'virgoplay_client_id';
const SESSION_KEY = 'virgoplay_client_session';

interface ClientAuthCtx {
  client: Client | null;
  loading: boolean;
  sessionToken: string | null;
  setClientId: (id: string, sessionToken?: string) => Promise<void>;
  clearClient: () => void;
  refreshClient: () => Promise<void>;
}

const Ctx = createContext<ClientAuthCtx | null>(null);

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadClient(clientId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, email, email_verified, is_active, created_at, full_name, phone, country, credit_balance')
      .eq('id', clientId)
      .maybeSingle();

    if (data && data.email_verified && data.is_active) {
      setClient(data as Client);
    } else if (error) {
      // Transient query failure — preserve the stored ID so the session
      // can recover on the next successful load/refresh.
    } else {
      setClient(null);
      setSessionToken(null);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
    setLoading(false);
  }

  // Stable identity: closing over only setState functions (always stable), so the
  // empty deps are correct. Prevents render → new-identity → effect → refresh loops.
  const refreshClient = useCallback(async function refreshClient() {
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (!storedId) return;
    await loadClient(storedId);
  }, []);

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_KEY);
    const storedToken = localStorage.getItem(SESSION_KEY);
    if (!storedId) {
      setLoading(false);
      return;
    }
    if (storedToken) {
      setSessionToken(storedToken);
    }
    loadClient(storedId);
  }, []);

  async function setClientId(id: string, token?: string) {
    localStorage.setItem(STORAGE_KEY, id);
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
      setSessionToken(token);
    }
    await loadClient(id);
  }

  function clearClient() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setClient(null);
  }

  return (
    <Ctx.Provider value={{ client, loading, sessionToken, setClientId, clearClient, refreshClient }}>
      {children}
    </Ctx.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useClientAuth must be inside ClientAuthProvider');
  return ctx;
}
