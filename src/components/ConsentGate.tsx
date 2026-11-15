import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const STORAGE_KEY = 'consent-accepted';

export function hasConsent(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

interface ConsentGateProps {
  onAccept: () => void;
}

export default function ConsentGate({ onAccept }: ConsentGateProps) {
  const [declined, setDeclined] = useState(false);

  function handleAccept() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
    onAccept();
  }

  if (declined) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)' }}>
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl shadow-slate-300/50 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Access Unavailable</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            You must be at least 18 years old and agree to the terms to access this content.
          </p>
          <button
            onClick={() => setDeclined(false)}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const logoUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/storage/v1/object/public/login-assets/login-logo.png`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)' }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl shadow-slate-300/50 overflow-hidden">
        {/* Logo header */}
        <div className="flex flex-col items-center pt-7 pb-4">
          <img
            src={logoUrl}
            alt="VirgoPlay"
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Content */}
        <div className="px-7 pb-7 space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-50 border border-violet-200 mb-3">
              <ShieldCheck className="w-6 h-6 text-violet-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">18+ Only</h2>
            <p className="text-sm text-slate-500 leading-relaxed mt-1.5">
              This experience is intended for adults aged 18 and over.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mt-0.5">
                <span className="text-xs font-bold text-blue-500">18</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Age Restriction</h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  You must be at least 18 years old to enter. By continuing, you confirm that you are 18+.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center mt-0.5">
                <span className="text-xs">🤖</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700">AI Character</h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  You are interacting with an AI character, not a real person.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center mt-0.5">
                <span className="text-xs">🎨</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700">AI-Generated Content</h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  Some images and videos may be AI-generated or AI-manipulated and may be prepared in advance and revealed as part of the experience.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed text-center">
            By clicking &ldquo;Accept&rdquo;, you agree to our{' '}
            <Link to="/terms-of-service" className="text-violet-500 hover:text-violet-600 underline-offset-2 hover:underline">Terms &amp; Conditions</Link>{' '}
            and{' '}
            <a href="/privacy-policy" className="text-violet-500 hover:text-violet-600 underline-offset-2 hover:underline">Privacy Policy</a>.
          </p>

          {/* Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              onClick={handleAccept}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-150 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 shadow-lg shadow-violet-500/25 active:scale-[0.98]"
            >
              I am 18+ &amp; Accept
            </button>
            <button
              onClick={() => setDeclined(true)}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 bg-transparent border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-600 active:scale-[0.98]"
            >
              Decline
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed text-center pt-1">
            If you do not meet the age requirement or do not agree, you will not be able to access this content.
          </p>
        </div>
      </div>
    </div>
  );
}
