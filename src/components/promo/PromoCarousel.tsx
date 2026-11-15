import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MessageSquare, Heart, ChevronLeft, ChevronRight } from 'lucide-react';

export interface PromoListing {
  creator_id: string;
  role_id: string;
  role_name: string;
  role_description: string;
  role_image_url: string | null;
  character_name: string | null;
  character_age: number | null;
  character_country: string | null;
  like_count: number;
}

function formatCharacterLabel(name: string | null, age: number | null, country: string | null): string {
  if (!name) return 'Unknown character';
  const parts = [name];
  if (age != null) parts.push(`${age}`);
  if (country) parts.push(country);
  return parts.join(', ');
}

interface PromoCarouselProps {
  listings: PromoListing[];
  loading: boolean;
  error: string | null;
  onOpenChat: (creatorId: string, roleId: string) => void;
  onOpenLibrary: () => void;
}

const RING_STEP = 360 / 8;

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

export default function PromoCarousel({ listings, loading, error, onOpenChat, onOpenLibrary }: PromoCarouselProps) {
  const prefersReducedMotion = useReducedMotion();
  const [offset, setOffset] = useState(0);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const pauseAutoRef = useRef(false);
  const dragStartRef = useRef<number | null>(null);
  // Hooks must run unconditionally on every render — before any early
  // returns — or React throws "rendered more hooks than during the
  // previous render" when data arrives.
  const vw = useViewportWidth();

  const count = listings.length;
  const useRing = !prefersReducedMotion && count >= 5 && count <= 14;

  const step = useCallback((dir: 1 | -1) => {
    setOffset(prev => prev + dir);
    pauseAutoRef.current = true;
  }, []);

  // Gentle auto-rotation for the ring, paused after manual interaction.
  useEffect(() => {
    if (!useRing || pauseAutoRef.current) return;
    const timer = setInterval(() => {
      if (!pauseAutoRef.current && !document.hidden) setOffset(prev => prev + 1);
    }, 3200);
    return () => clearInterval(timer);
  }, [useRing]);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartRef.current = e.touches[0].clientX;
    pauseAutoRef.current = true;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (dragStartRef.current == null) return;
    const dx = e.changedTouches[0].clientX - dragStartRef.current;
    dragStartRef.current = null;
    if (Math.abs(dx) > 36) setOffset(prev => prev + (dx < 0 ? 1 : -1));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-14" aria-busy="true" aria-label="Loading roleplays">
        <div className="flex gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-44 aspect-[9/16] rounded-2xl bg-white/[0.06] border border-white/10 animate-pulse" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-sm mx-auto text-center py-12 px-6">
        <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-200 mb-1">Roleplays could not be loaded</p>
        <button
          onClick={onOpenLibrary}
          className="text-sm text-sky-300 hover:text-sky-200 font-medium transition-colors">
          Browse the Chat Library instead
        </button>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="max-w-sm mx-auto text-center py-12 px-6">
        <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-200 mb-1">No published roleplays yet</p>
        <p className="text-xs text-slate-400 leading-relaxed">New roleplays will appear here as creators publish them.</p>
      </div>
    );
  }

  function handleImgError(creatorId: string, roleId: string) {
    setImgErrors(prev => new Set(prev).add(`${creatorId}:${roleId}`));
  }

  // Simple scroll strip for reduced motion or few listings.
  if (!useRing) {
    return (
      <div
        className="overflow-x-auto pb-4 -mx-6 px-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="list"
        aria-label="Published roleplays">
        <div className="flex gap-5 w-max mx-auto">
          {listings.map(l => (
            <button
              key={`${l.creator_id}-${l.role_id}`}
              onClick={() => onOpenChat(l.creator_id, l.role_id)}
              role="listitem"
              className="promo-card group w-[36vw] max-w-[154px] sm:w-36 flex-shrink-0 text-left rounded-2xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <div className="aspect-[9/16] bg-white/[0.04] flex items-center justify-center overflow-hidden">
                {l.role_image_url && !imgErrors.has(`${l.creator_id}:${l.role_id}`) ? (
                  <img
                    src={l.role_image_url}
                    alt={l.role_name}
                    loading="lazy"
                    onError={() => handleImgError(l.creator_id, l.role_id)}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                ) : (
                  <MessageSquare className="w-8 h-8 text-slate-500" />
                )}
              </div>
              <div className="p-3.5">
                <div className="text-sm font-bold text-slate-100 truncate">{formatCharacterLabel(l.character_name, l.character_age, l.character_country)}</div>
                <div className="text-xs font-medium text-sky-300 truncate">{l.role_name}</div>
                <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                  <span>{l.like_count}</span><Heart className="w-3 h-3 text-rose-400" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Viewport-aware ring geometry: mobile cards span ~36% of the screen
  // width (52% spec reduced by 30%), desktop keeps the fixed comfortable
  // size. Height follows the preserved 9/16 aspect ratio.
  const isMobile = vw < 640;
  const cardW = isMobile ? Math.round(vw * 0.364) : 140;
  const radius = isMobile ? Math.round(cardW * 1.6) : 210;
  const ringHeight = isMobile ? Math.round(cardW * (16 / 9) + 80) : 330;
  const cardTop = isMobile ? -Math.round(ringHeight / 2) : -165;
  return (
    <div className="relative select-none">
      <div
        className="relative mx-auto"
        style={{ perspective: '1100px', height: ringHeight }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-label="Published roleplay carousel">
        <motion.div
          className="absolute left-1/2 top-1/2"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: -(offset * RING_STEP) }}
          transition={prefersReducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 42, damping: 14 }}>
          {listings.slice(0, 8).map((l, i) => {
            const angle = i * RING_STEP;
            const imgBroken = imgErrors.has(`${l.creator_id}:${l.role_id}`);
            return (
              <button
                key={`${l.creator_id}-${l.role_id}`}
                onClick={() => onOpenChat(l.creator_id, l.role_id)}
                aria-label={`Open roleplay: ${l.role_name}`}
                className="promo-card absolute text-left rounded-2xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                style={{
                  width: cardW,
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  left: -cardW / 2,
                  top: cardTop,
                }}>
                <div className="aspect-[9/16] bg-white/[0.04] flex items-center justify-center">
                  {l.role_image_url && !imgBroken ? (
                    <img
                      src={l.role_image_url}
                      alt={l.role_name}
                      loading="lazy"
                      onError={() => handleImgError(l.creator_id, l.role_id)}
                      className="w-full h-full object-cover" />
                  ) : (
                    <MessageSquare className="w-8 h-8 text-slate-500" />
                  )}
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-bold text-slate-100 truncate">{formatCharacterLabel(l.character_name, l.character_age, l.character_country)}</div>
                  <div className="text-[11px] font-medium text-sky-300 truncate">{l.role_name}</div>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                    <span>{l.like_count}</span><Heart className="w-3 h-3 text-rose-400" />
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-2">
        <button
          onClick={() => step(-1)}
          aria-label="Previous roleplay"
          className="promo-nav-btn w-11 h-11 rounded-full flex items-center justify-center text-slate-300">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => step(1)}
          aria-label="Next roleplay"
          className="promo-nav-btn w-11 h-11 rounded-full flex items-center justify-center text-slate-300">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
