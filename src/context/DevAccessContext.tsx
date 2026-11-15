/**
 * DEV Access — session-scoped gate for the existing DEV ON/OFF controls.
 *
 * The developer credentials only reveal the DEV controls; they grant no
 * privileges, no authentication, and no database access. State is in-memory
 * only and resets on full page reload.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

const DEV_EMAIL = 'dev@dev.com';
const DEV_PASSWORD = 'VJvinus88';
const MAX_ATTEMPTS = 5;

interface DevAccessCtx {
  unlocked: boolean;
  failedAttempts: number;
  locked: boolean;
  submitDevLogin: (email: string, password: string) => { success: boolean; locked: boolean };
  unlock: () => void;
  reset: () => void;
}

const Ctx = createContext<DevAccessCtx | null>(null);

export function DevAccessProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  const submitDevLogin = useCallback((email: string, password: string) => {
    if (locked) return { success: false, locked: true };

    if (email.trim().toLowerCase() === DEV_EMAIL && password === DEV_PASSWORD) {
      setUnlocked(true);
      setFailedAttempts(0);
      setLocked(false);
      return { success: true, locked: false };
    }

    const next = failedAttempts + 1;
    setFailedAttempts(next);
    if (next >= MAX_ATTEMPTS) setLocked(true);
    return { success: false, locked: next >= MAX_ATTEMPTS };
  }, [locked, failedAttempts]);

  const unlock = useCallback(() => {
    setUnlocked(true);
    setFailedAttempts(0);
    setLocked(false);
  }, []);

  const reset = useCallback(() => {
    setUnlocked(false);
    setFailedAttempts(0);
    setLocked(false);
  }, []);

  return (
    <Ctx.Provider value={{ unlocked, failedAttempts, locked, submitDevLogin, unlock, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDevAccess() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDevAccess must be inside DevAccessProvider');
  return ctx;
}
