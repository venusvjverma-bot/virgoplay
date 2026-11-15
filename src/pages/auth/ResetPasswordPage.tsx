import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [showCf, setShowCf]       = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // Supabase delivers the recovery token via the URL hash as a PKCE flow.
  // onAuthStateChange fires with event=PASSWORD_RECOVERY once the token is exchanged.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTokenReady(true);
      }
    });

    // If the page loads without a valid hash token the event never fires.
    // Give it 3s then show an error to avoid an indefinite spinner.
    const timer = setTimeout(() => {
      setTokenError('This reset link is invalid or has expired. Please request a new one.');
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Cancel the timeout error once the token arrives.
  useEffect(() => {
    if (tokenReady) setTokenError('');
  }, [tokenReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    await supabase.auth.signOut();
    navigate('/login', { state: { passwordReset: true }, replace: true });
  }

  // Token error state — link is invalid/expired
  if (tokenError && !tokenReady) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-surface-50">Creator Portal AI</span>
          </div>
          <div className="card">
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {tokenError}
            </div>
            <button onClick={() => navigate('/forgot-password')} className="btn-primary w-full py-3">
              Request a new reset link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state — waiting for token exchange
  if (!tokenReady) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-400 text-sm animate-pulse">Verifying reset link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-surface-50">Creator Portal AI</span>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold text-surface-50 mb-1">Choose a new password</h1>
          <p className="text-sm text-surface-400 mb-6">Must be at least 8 characters.</p>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  className="input-field pr-10"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Confirm new password</label>
              <div className="relative">
                <input
                  type={showCf ? 'text' : 'password'}
                  required
                  className="input-field pr-10"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(''); }}
                />
                <button type="button" onClick={() => setShowCf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm && password && confirm === password && (
                <p className="flex items-center gap-1 text-xs text-accent-400 mt-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Passwords match
                </p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? 'Saving...' : 'Save new password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
