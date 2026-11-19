import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, LogIn, UserPlus, Sparkles, MessageCircle, Eye } from 'lucide-react';
import { supabase, supabaseUrl } from '../../lib/supabase';
import HelpSupportModal from '../../components/HelpSupportModal';
import BlackKitten from '../../components/BlackKitten';

type AuthMode = 'signup' | 'signin';



const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI characters with personality',
    desc: 'Talk to characters who have their own style, mood and way of talking.',
  },
  {
    icon: MessageCircle,
    title: 'Chat your way',
    desc: 'Say whatever you want. Ask questions, joke, flirt, or simply start with a hello.',
  },
  {
    icon: Eye,
    title: 'More than just chat',
    desc: 'As your conversation continues, discover images and videos along the way.',
  },
];

export default function ClientSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode]         = useState<AuthMode>(
    searchParams.get('mode') === 'signin' ? 'signin' : 'signup'
  );
  const [email, setEmail]       = useState('');
  const [error, setError]       = useState('');
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [showContact, setShowContact] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/client-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, mode }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      setSent(true);
      navigate(`/client-verify?email=${encodeURIComponent(email)}&mode=${mode}${searchParams.get('return_to') ? `&return_to=${encodeURIComponent(searchParams.get('return_to')!)}` : ''}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode: AuthMode) {
    setMode(newMode);
    setError('');
    setSent(false);
  }

  async function handleGoogleSignIn() {
    setError('');
    const returnTo = searchParams.get('return_to');
    const redirectTo = `${window.location.origin}/client-auth-callback${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`;
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const isSignIn = mode === 'signin';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar — banner header */}
      <header className="vp-header-banner vp-header sticky top-0 z-30 border-b border-indigo-400/20">
        <img src="/client-header-banner.png" alt="VirgoPlay" />
      </header>

      {/* Main area */}
      <main className="flex-1 flex flex-col items-center px-5 py-12">
        <div className="w-full max-w-md animate-slide-up relative z-10">
          {/* Black kitten — above the card, slightly left of center */}
          <div className="flex justify-start pl-6 mb-1 relative z-10">
            <BlackKitten size={90} />
          </div>

          {/* 3D ID Card */}
          <div className="id-card-scene">
            <div className="id-card-thread" aria-hidden="true" />
            <div className="id-card-wrapper">
              <div className="id-card-3d p-6">
                <div className="id-card-hole" />
            {/* Heading inside the card */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                {isSignIn ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {isSignIn
                  ? 'Enter your email and we\u2019ll send you a verification code to sign in.'
                  : 'Enter your email and we\u2019ll send you a verification code.'}
              </p>
            </div>
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 mb-6 rounded-xl bg-slate-50 border border-slate-200/70">
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === 'signup'
                    ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Create Account
              </button>
              <button
                onClick={() => switchMode('signin')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === 'signin'
                    ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            </div>

            {sent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-600 text-sm">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    We sent a 6-digit verification code to <strong>{email}</strong>.
                    It expires in 15 minutes.
                  </span>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 text-sm mb-5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                {/* Continue with Google */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-50 mt-2"
                  >
                    {loading ? 'Sending...' : isSignIn ? 'Send sign-in code' : 'Send verification code'}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-400 mt-5">
                  {isSignIn ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    onClick={() => switchMode(isSignIn ? 'signup' : 'signin')}
                    className="text-violet-600 hover:text-violet-700 font-medium transition-colors"
                  >
                    {isSignIn ? 'Create account' : 'Sign in'}
                  </button>
                </p>
              </>
            )}
          </div>
              </div>
            </div>
          </div>

        {/* Feature section */}
        <div className="w-full max-w-md mt-16">
          <h2 className="text-xl font-bold text-slate-800 text-center mb-8">
            Meet someone new.
          </h2>

          <div className="space-y-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-slate-500 mt-8 italic">
            Say hello. Start talking. See what happens.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white/60">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <button
              onClick={() => setShowContact(true)}
              className="text-sm text-slate-400 hover:text-violet-600 transition-colors"
            >
              Contact Us
            </button>
            <Link
              to="/about-us"
              className="text-sm text-slate-400 hover:text-violet-600 transition-colors"
            >
              About Us
            </Link>
            <Link
              to="/terms-of-service"
              className="text-sm text-slate-400 hover:text-violet-600 transition-colors"
            >
              Terms &amp; Conditions
            </Link>
            <Link
              to="/privacy-policy"
              className="text-sm text-slate-400 hover:text-violet-600 transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
          <p className="text-center text-xs text-slate-300 mt-4">
            &copy; {new Date().getFullYear()} VirgoPlay. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Contact Us popup — shared with Login page */}
      {showContact && <HelpSupportModal onClose={() => setShowContact(false)} />}
    </div>
  );
}
