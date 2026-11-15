import { ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'consent-accepted';
const LEGACY_KEY = 'age-confirmed';

export function hasAgeConfirmation(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true' ||
           localStorage.getItem(LEGACY_KEY) === 'true';
  } catch { return false; }
}

export function clearAgeConfirmation(): void {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
}

interface AgeConfirmationModalProps {
  onConfirm: () => void;
}

export default function AgeConfirmationModal({ onConfirm }: AgeConfirmationModalProps) {
  function handleConfirm() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 shadow-2xl shadow-black/50 animate-slide-up">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div className="w-14 h-14 rounded-full bg-warning-500/15 border border-warning-500/30 flex items-center justify-center mb-5">
            <ShieldCheck className="w-7 h-7 text-warning-400" />
          </div>

          <h2 className="text-xl font-bold text-surface-50 mb-2">18+ ONLY</h2>
          <p className="text-sm text-surface-300 leading-relaxed mb-6">
            This platform is intended for adults aged 18 and over.
          </p>

          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-lg text-white font-bold text-sm transition-all duration-150 bg-gradient-to-b from-primary-500/70 to-primary-700/70 border border-primary-400/30 hover:from-primary-500/80 hover:to-primary-700/80 active:from-primary-600/80 active:to-primary-800/80 shadow-lg shadow-primary-600/30"
          >
            I am 18 or older
          </button>

          <div className="flex items-center gap-4 mt-5">
            <a
              href="/terms-of-service"
              className="text-xs text-surface-500 hover:text-surface-300 transition-colors underline-offset-2 hover:underline"
            >
              Terms of Service
            </a>
            <span className="text-surface-700">·</span>
            <a
              href="/privacy-policy"
              className="text-xs text-surface-500 hover:text-surface-300 transition-colors underline-offset-2 hover:underline"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
