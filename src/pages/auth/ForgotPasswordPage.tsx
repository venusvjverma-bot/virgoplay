import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/send-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, redirect_url: 'https://virgoplay.net/reset-password' }),
      });

      setLoading(false);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Request failed (${response.status})`);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Failed to send reset email');
      setSent(true);
    } catch (e) {
      setLoading(false);
      setError((e as Error).message);
    }
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
          <h1 className="text-2xl font-bold text-surface-50 mb-1">Reset your password</h1>
          <p className="text-sm text-surface-400 mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          {sent ? (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Check your inbox — a password reset link has been sent to <strong>{email}</strong>.
                The link expires in 1 hour.
              </span>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email address</label>
                  <input
                    type="email"
                    required
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-surface-400 mt-5">
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
