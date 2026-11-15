import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, RefreshCw, Heart } from 'lucide-react';

export interface RevealCharacter {
  creator_id: string;
  role_id: string;
  role_name: string;
  role_description: string;
  role_image_url: string | null;
  character_name: string | null;
  like_count: number;
}

interface Props {
  listings: RevealCharacter[];
}

type Phase = 'idle' | 'cycling' | 'revealed';

const CYCLE_DURATION = 3000;
const INTERVAL_MS = 120;

export default function CharacterReveal({ listings }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [centerIdx, setCenterIdx] = useState(0);
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const eligible = listings.filter(l => l.role_image_url);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const startReveal = useCallback(() => {
    if (eligible.length < 2 || phase === 'cycling') return;
    clearTimers();
    setPhase('cycling');
    setRevealedIdx(null);
    setInfoVisible(false);

    const startTime = Date.now();
    const interval = setInterval(() => {
      setCenterIdx(prev => (prev + 1) % eligible.length);
    }, INTERVAL_MS);

    timersRef.current.push(setTimeout(() => {
      clearInterval(interval);
      const remaining = CYCLE_DURATION - (Date.now() - startTime);
      const finalIdx = Math.floor(Math.random() * eligible.length);
      setCenterIdx(finalIdx);
      setRevealedIdx(finalIdx);
      setPhase('revealed');
      const t = setTimeout(() => setInfoVisible(true), 600);
      timersRef.current.push(t);
    }, CYCLE_DURATION - 200));
  }, [eligible.length, phase, clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setRevealedIdx(null);
    setInfoVisible(false);
    setCenterIdx(0);
  }, [clearTimers]);

  if (eligible.length < 2) return null;

  const displayCount = Math.min(5, eligible.length);
  const sideOffset = Math.floor(displayCount / 2);
  const cards: { listing: RevealCharacter; offset: number }[] = [];
  for (let i = -sideOffset; i <= sideOffset; i++) {
    const idx = (centerIdx + i + eligible.length) % eligible.length;
    cards.push({ listing: eligible[idx], offset: i });
  }

  const revealed = revealedIdx !== null ? eligible[revealedIdx] : null;

  function cardClass(offset: number): string {
    const base = 'cr-card';
    if (phase === 'idle') {
      if (offset === 0) return `${base} cr-center cr-blurred`;
      return `${base} cr-side`;
    }
    if (phase === 'cycling') {
      if (offset === 0) return `${base} cr-center cr-cycling`;
      return `${base} cr-side cr-cycling`;
    }
    // revealed
    if (offset === 0) return `${base} cr-selected`;
    return `${base} cr-side`;
  }

  return (
    <div className="cr-section mt-10">
      {/* Headline */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold text-slate-800 tracking-tight">
          Someone is waiting for you&hellip;
        </h2>
        <p className="text-sm text-slate-400 mt-1">Let fate pick your next chat.</p>
      </div>

      {/* Card track */}
      <div className="cr-card-track">
        {cards.map(({ listing, offset }) => (
          <div
            key={`${listing.creator_id}-${listing.role_id}-${offset}`}
            className={cardClass(offset)}
          >
            <img src={listing.role_image_url!} alt={listing.role_name} />
            {phase === 'revealed' && offset === 0 && <div className="cr-sweep" />}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 mt-6">
        {phase !== 'revealed' ? (
          <button
            onClick={startReveal}
            disabled={phase === 'cycling'}
            className="cr-btn inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {phase === 'cycling' ? 'Revealing…' : 'Reveal Someone'}
          </button>
        ) : (
          <>
            <div className={`cr-info ${infoVisible ? 'cr-info-visible' : ''} text-center`}>
              {revealed && (
                <>
                  <div className="text-base font-bold text-slate-800">
                    {revealed.character_name ?? 'Unknown Character'}
                  </div>
                  <div className="text-sm text-violet-500 font-medium mt-0.5">
                    {revealed.role_name}
                  </div>
                  {revealed.role_description && (
                    <p className="text-sm text-slate-500 leading-relaxed mt-1 max-w-xs">
                      {revealed.role_description}
                    </p>
                  )}
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <button
                      onClick={() =>
                        navigate(`/test-chat?role_id=${revealed.role_id}&creator_id=${revealed.creator_id}`)
                      }
                      className="cr-btn inline-flex items-center gap-2"
                    >
                      Chat with {revealed.character_name ?? 'them'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button onClick={startReveal} className="cr-btn-secondary inline-flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reveal someone else
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
