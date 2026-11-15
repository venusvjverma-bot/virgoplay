import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, AlertCircle, CheckCircle, ToggleLeft, ToggleRight, MessageCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Creator } from '../../types';
import VideoCarousel from '../../components/VideoCarousel';
import ConsentGate, { hasConsent } from '../../components/ConsentGate';
import HelpSupportModal from '../../components/HelpSupportModal';
import { useDevAccess } from '../../context/DevAccessContext';
import { useAuth } from '../../context/AuthContext';
import { Pip } from '../../components/Pip';

const MOTHER_ACCOUNT_EMAIL = 'test.test@gmail.com';

const CHAT_LIBRARY_HEADING = 'Looking for someone to talk to?';

const BUCKET = 'login-videos';

interface LoginVideo {
  id: string;
  storage_path: string;
  sort_order: number;
}

export default function LoginPage() {
  const { unlocked, unlock } = useDevAccess();
  const { session, creator, loading: authLoading } = useAuth();
  const [consentAccepted, setConsentAccepted] = useState(hasConsent);
  const [showPreloader, setShowPreloader] = useState(true);
  const [preloaderExiting, setPreloaderExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setPreloaderExiting(true), 1500);
    const removeTimer = setTimeout(() => setShowPreloader(false), 2000);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, []);

  const [videoReady, setVideoReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset ?? false;
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [devMode, setDevMode]   = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [typedHeading, setTypedHeading] = useState('');
  useEffect(() => {
    let charIdx = 0;
    let phase: 'typing' | 'hold' | 'reset' = 'typing';
    const STEP_MS = 1500 / CHAT_LIBRARY_HEADING.length;

    const tick = () => {
      if (phase === 'typing') {
        if (charIdx < CHAT_LIBRARY_HEADING.length) {
          charIdx++;
          setTypedHeading(CHAT_LIBRARY_HEADING.slice(0, charIdx));
          timer = window.setTimeout(tick, STEP_MS);
        } else {
          phase = 'hold';
          timer = window.setTimeout(tick, 4000 - 1500);
        }
      } else if (phase === 'hold') {
        phase = 'reset';
        timer = window.setTimeout(tick, 50);
      } else {
        charIdx = 0;
        setTypedHeading('');
        phase = 'typing';
        timer = window.setTimeout(tick, 50);
      }
    };

    let timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Background video state (DEV OFF) ───────────────────────────────────────
  const [bgVideos, setBgVideos]       = useState<LoginVideo[]>([]);
  const [bgVideoUrls, setBgVideoUrls] = useState<string[]>([]);
  const [bgIndex, setBgIndex]         = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadBgVideos = useCallback(async () => {
    const { data, error: qe } = await supabase
      .from('login_videos')
      .select('id, storage_path, sort_order')
      .eq('is_selected', true)
      .order('sort_order', { ascending: true });
    if (qe || !data || data.length === 0) { setBgVideos([]); setBgVideoUrls([]); return; }
    const rows = data as LoginVideo[];
    setBgVideos(rows);
    const urls = await Promise.all(rows.map(async (r) => {
      const { data: sdata } = await supabase.storage
        .from(BUCKET).createSignedUrl(r.storage_path, 3600 * 24 * 7);
      return sdata?.signedUrl ?? '';
    }));
    setBgVideoUrls(urls.filter(Boolean));
  }, []);

  useEffect(() => {
    if (!devMode && bgVideos.length === 0) void loadBgVideos();
  }, [devMode, bgVideos.length, loadBgVideos]);

  // When the current background video ends, advance to the next (endless loop)
  function handleBgEnded() {
    if (bgVideoUrls.length <= 1) return;
    setBgIndex(i => (i + 1) % bgVideoUrls.length);
  }

  // Play the video whenever the index or URL list changes
  useEffect(() => {
    if (devMode || bgVideoUrls.length === 0) return;
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
  }, [devMode, bgIndex, bgVideoUrls]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.user) {
      setError(err?.message ?? 'Invalid email or password.');
      setLoading(false);
      return;
    }

    const { data: creator } = await supabase
      .from('creators').select('role').eq('id', data.user.id).maybeSingle();

    if (email.trim().toLowerCase() === MOTHER_ACCOUNT_EMAIL) {
      unlock();
    }

    navigate((creator as Partial<Creator>)?.role === 'admin' ? '/admin' : '/dashboard');
  }

  if (showPreloader || authLoading) {
    return (
      <div className={`vp-preloader-overlay ${preloaderExiting && !authLoading ? 'vp-preloader-overlay--exiting' : ''}`}>
        <div className="vp-preloader-logo flex flex-col items-center gap-5">
          <div className="vp-preloader-ring" />
          <div className="vp-preloader-brand-text">VirgoPlay</div>
          <div className="vp-preloader-tagline">WELCOME TO VIRGOPLAY</div>
        </div>
      </div>
    );
  }

  // Already-authenticated creators (Back button, direct /login visits) go straight to their area
  if (session) {
    return <Navigate to={creator?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  if (!consentAccepted) {
    return (
      <>
        <ConsentGate onAccept={() => setConsentAccepted(true)} />
        {/* Hidden preloading video so the browser starts downloading during the 18+ gate */}
        {!devMode && bgVideoUrls.length > 0 && (
          <video
            src={bgVideoUrls[0]}
            preload="auto"
            muted
            playsInline
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', top: 0, left: 0 }}
          />
        )}
      </>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Brand logo — top-left header area */}
      <div className="absolute top-6 left-6 z-20">
        <img
          src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/login-assets/logo-2.png`}
          alt="VirgoPlay"
          className="h-[60px] w-auto object-contain"
          style={{ background: 'transparent' }}
        />
      </div>

      {/* Background video — DEV OFF only */}
      {!devMode && bgVideoUrls.length > 0 && (
        <video
          key={bgIndex}
          ref={videoRef}
          src={bgVideoUrls[bgIndex]}
          autoPlay
          muted
          loop={bgVideoUrls.length <= 1}
          playsInline
          controls={false}
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onEnded={handleBgEnded}
          className="absolute inset-0 w-full h-full object-cover z-0 bg-surface-950 transition-opacity duration-700"
          style={{ outline: 'none', opacity: videoReady ? 1 : 0 }}
        />
      )}

      {/* VirgoPlay preloader shown after consent until video is ready */}
      {consentAccepted && !videoReady && !devMode && bgVideoUrls.length > 0 && (
        <div className="vp-preloader-overlay" style={{ zIndex: 5 }}>
          <div className="vp-preloader-logo flex flex-col items-center gap-5">
            <div className="vp-preloader-ring" />
            <div className="vp-preloader-brand-text">VirgoPlay</div>
            <div className="vp-preloader-tagline">WELCOME TO VIRGOPLAY</div>
          </div>
        </div>
      )}

      {/* DEV ON / DEV OFF toggle — only visible after DEV PIN unlock */}
      {unlocked && (
        <div className="w-full max-w-md flex items-center justify-end mb-3 animate-slide-up relative z-10">
          <button
            type="button"
            onClick={() => setDevMode(d => !d)}
            className="flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors select-none"
            aria-label={devMode ? 'Turn dev mode off' : 'Turn dev mode on'}
          >
            <span>DEV {devMode ? 'ON' : 'OFF'}</span>
            {devMode
              ? <ToggleRight className="w-8 h-8 text-primary-400" />
              : <ToggleLeft className="w-8 h-8 text-surface-600" />}
          </button>
        </div>
      )}

      <div className="w-full max-w-md animate-slide-up relative z-10">
        {devMode && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-surface-50">Creator Portal AI</span>
          </div>
        )}

        <div className={devMode ? 'card' : 'rounded-xl p-6 border border-white/5 bg-white/[0.03] backdrop-blur-sm shadow-2xl shadow-black/40'}>
          <h1 className="text-2xl font-bold text-white mb-1">Back to your roleplays</h1>
          <p className="text-sm text-slate-100 mb-6">Sign in as a creator to create, manage, and share your roleplays.</p>

          {passwordReset && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm mb-5">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Password updated successfully. Sign in with your new password.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-1.5">Email address</label>
              <input type="email" required className={devMode ? 'input-field' : 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-surface-100 placeholder-slate-300 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors duration-150'} placeholder="you@example.com"
                value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-white" style={{ marginBottom: 0 }}>Password</label>
                <Link to="/forgot-password" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} required className={devMode ? 'input-field pr-10' : 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-surface-100 placeholder-slate-300 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors duration-150 pr-10'}
                  placeholder="Your password"
                  value={password} onChange={e => { setPassword(e.target.value); setError(''); }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className={devMode ? 'btn-primary w-full py-3 mt-2' : 'w-full py-3 mt-2 inline-flex items-center justify-center gap-2 rounded-lg text-white font-bold text-sm transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900 bg-gradient-to-b from-primary-500/70 to-primary-700/70 border border-primary-400/30 hover:from-primary-500/80 hover:to-primary-700/80 active:from-primary-600/80 active:to-primary-800/80 shadow-lg shadow-primary-600/30'}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-200 mt-5">
            No account yet?{' '}
            <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Create one free
            </Link>
          </p>
        </div>

        {/* ── Chat Library direction ─────────────────────────────────── */}
        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="vp-glossy-chat-icon inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-white" strokeWidth={2.5} />
            </span>
            <p className="text-lg font-bold vp-gradient-heading">{typedHeading}</p>
          </div>
          <p className="text-sm text-white mt-1.5 leading-relaxed">
            The Chat Library is open. Find a conversation that interests you and start talking.
          </p>
          <p className="text-xs font-bold text-white mt-2 tracking-[0.12em] uppercase">
            Unlimited Chat · No Signup · Just Talk
          </p>
          <button
            onClick={() => navigate('/chat-library')}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm transition-all duration-150 active:scale-[0.97] border border-white/20"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' }}
          >
            <MessageCircle className="w-4 h-4" />
            Explore Chat Library
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Video Carousel — only visible in DEV ON mode */}
        {devMode && <VideoCarousel />}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="w-full max-w-md mt-4 relative z-10 animate-slide-up">
        <div className="flex items-center justify-between px-6 py-3 rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="text-sm font-bold text-surface-200 hover:text-white transition-colors"
          >
            Contact us
          </button>

          <span className="text-surface-600 text-sm select-none">•</span>

          <Link
            to="/about-us"
            className="text-sm font-bold text-surface-200 hover:text-white transition-colors"
          >
            About us
          </Link>
        </div>
      </div>

      {/* ── Help & Support Modal ──────────────────────────────────────── */}
      {showHelpModal && <HelpSupportModal onClose={() => setShowHelpModal(false)} />}

      <Pip />

    </div>
  );
}
