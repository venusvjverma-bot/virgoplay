/**
 * DEV login modal — discreet gate for revealing DEV controls.
 *
 * Correct developer credentials unlock DEV access for the session.
 * 5 consecutive wrong attempts locks further entry for the session.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDevAccess } from '../context/DevAccessContext';

const MAX_ATTEMPTS = 5;

export default function DevPinModal({ onClose }: { onClose: () => void }) {
  const { submitDevLogin, locked, failedAttempts } = useDevAccess();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;

    const result = submitDevLogin(email, password);
    if (result.success) {
      setSuccess(true);
      setError('');
      setTimeout(onClose, 900);
    } else if (result.locked) {
      setError('Maximum attempts reached. DEV access locked for this session.');
    } else {
      const left = MAX_ATTEMPTS - failedAttempts - 1;
      setError(left > 0 ? `Incorrect credentials. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect credentials.');
    }
    setEmail('');
    setPassword('');
  }

  const attemptsLeft = MAX_ATTEMPTS - failedAttempts;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={success ? undefined : onClose}
      />
      <div className="relative w-full max-w-xs rounded-2xl border border-surface-700/60 bg-surface-900/95 backdrop-blur-xl shadow-2xl p-6 animate-slide-up">
        <button
          onClick={onClose}
          disabled={success}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className={[
            'w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-colors',
            success
              ? 'bg-success-600/20 text-success-400'
              : locked
                ? 'bg-danger-500/15 text-danger-400'
                : 'bg-primary-600/15 text-primary-400',
          ].join(' ')}>
            {success ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <h2 className="text-base font-semibold text-surface-100">
            {success ? 'DEV Access Unlocked' : locked ? 'DEV Access Locked' : 'DEV Access'}
          </h2>
          {!success && !locked && (
            <p className="text-xs text-surface-500 mt-1">Enter developer credentials</p>
          )}
        </div>

        {success ? (
          <p className="text-center text-sm text-success-400">
            You can now use DEV controls.
          </p>
        ) : locked ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Too many incorrect attempts. DEV login is disabled for this session.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="Email"
              className="w-full bg-surface-800/60 border border-surface-700 rounded-lg px-4 py-2.5 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              autoComplete="off"
            />
            <input
              type="password"
              required
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
              className="w-full bg-surface-800/60 border border-surface-700 rounded-lg px-4 py-2.5 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              autoComplete="off"
            />
            {error && (
              <p className="text-xs text-danger-400 text-center">{error}</p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Unlock
            </button>
            {attemptsLeft < MAX_ATTEMPTS && (
              <p className="text-xs text-surface-600 text-center">
                {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} remaining
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
