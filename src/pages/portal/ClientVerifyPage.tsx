import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { supabaseUrl } from '../../lib/supabase';
import { useClientAuth } from '../../context/ClientAuthContext';



export default function ClientVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setClientId } = useClientAuth();

  const initialEmail = searchParams.get('email') ?? '';
  const mode = searchParams.get('mode') === 'signin' ? 'signin' : 'signup';
  const isSignIn = mode === 'signin';
  const returnTo = searchParams.get('return_to');

  const [email, setEmail]     = useState(initialEmail);
  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/client-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, code, mode }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      if (data.client_id) {
        await setClientId(data.client_id, data.session_token);
      }
      setVerified(true);
      setTimeout(() => navigate(returnTo || '/client-welcome'), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar — banner header */}
      <header className="vp-header-banner vp-header sticky top-0 z-30 border-b border-indigo-400/20">
        <img src="/client-header-banner.png" alt="VirgoPlay" />
      </header>

      {/* Main area */}
      <main className="flex-1 flex flex-col items-center px-5 py-12">
        <div className="w-full max-w-md relative z-10">
          {/* 3D ID Card — stationary, no entrance animation */}
          <div className="id-card-scene id-card-static">
            <div className="id-card-thread" aria-hidden="true" />
            <div className="id-card-wrapper">
              <div className="id-card-3d p-6">
                <div className="id-card-hole" />
                {/* Heading inside the card */}
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                    {isSignIn ? 'Sign in' : 'Verify your email'}
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    Enter the 6-digit code we sent to your email.
                  </p>
                </div>

                {verified ? (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-600 text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {isSignIn ? 'Signed in successfully. Redirecting...' : 'Email verified successfully. Redirecting...'}
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 text-sm mb-5">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
                        <input
                          type="email"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                          placeholder="you@example.com"
                          value={email}
                          onChange={e => { setEmail(e.target.value); setError(''); }}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Verification code</label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all text-center text-2xl tracking-widest font-mono"
                          placeholder="000000"
                          value={code}
                          onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-50 mt-2"
                      >
                        {loading ? 'Verifying...' : isSignIn ? 'Sign in' : 'Verify email'}
                      </button>
                    </form>

                    <p className="text-center text-sm text-slate-400 mt-5">
                      Didn't get a code?{' '}
                      <button
                        onClick={() => navigate(`/client-signup${isSignIn ? '?mode=signin' : ''}${returnTo ? `${isSignIn ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}` : ''}`)}
                        className="text-violet-600 hover:text-violet-700 font-medium transition-colors"
                      >
                        Resend
                      </button>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
