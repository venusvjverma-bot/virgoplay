import { useEffect, useRef, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

export default function VerifiedHero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      x: 30 + Math.random() * 40,
      y: 20 + Math.random() * 60,
      size: 2 + Math.random() * 3,
      delay: 1 + Math.random() * 2,
      duration: 8 + Math.random() * 6,
    })),
  );

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          setMounted(entry.isIntersecting);
        });
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionRef} className="relative min-h-[calc(100vh-3.5rem-5rem)] flex flex-col items-center justify-center overflow-hidden bg-surface-950 px-6 py-10">
      {/* Radial green glow behind shield */}
      <div
        className={`absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full pointer-events-none transition-all duration-[2000ms] ease-out ${
          mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(53,214,160,0.18) 0%, rgba(53,214,160,0.06) 40%, transparent 70%)',
        }}
      />

      {/* Expanding glow ring */}
      <div
        className={`absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none ${
          mounted ? 'vhero-glow-expand' : 'opacity-0'
        }`}
        style={{ width: '120px', height: '120px', border: '1.5px solid rgba(53,214,160,0.4)' }}
      />

      {/* Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none vhero-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: 'rgba(53,214,160,0.5)',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      {/* Shield SVG */}
      <div
        className={`relative z-10 transition-all duration-700 ease-out ${
          mounted ? 'opacity-100 scale-100 vhero-pulse' : 'opacity-0 scale-75'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        <svg width="100" height="112" viewBox="0 0 100 112" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="vhero-shield-stroke" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#35D6A0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#35D6A0" stopOpacity="0.5" />
            </linearGradient>
            <radialGradient id="vhero-shield-fill" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stopColor="rgba(53,214,160,0.10)" />
              <stop offset="100%" stopColor="rgba(53,214,160,0.02)" />
            </radialGradient>
            <filter id="vhero-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Shield outline */}
          <path
            d="M50 4 L92 20 L92 56 C92 82 72 100 50 108 C28 100 8 82 8 56 L8 20 Z"
            fill="url(#vhero-shield-fill)"
            stroke="url(#vhero-shield-stroke)"
            strokeWidth="1.5"
            filter="url(#vhero-glow)"
          />

          {/* Checkmark */}
          <path
            d="M32 56 L44 70 L70 38"
            stroke="#35D6A0"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            className={mounted ? 'vhero-checkmark' : ''}
            style={{ strokeDasharray: 52, strokeDashoffset: mounted ? 0 : 52 }}
          />
        </svg>
      </div>

      {/* Status badge */}
      <div
        className={`relative z-10 mt-7 transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
        style={{ transitionDelay: '0.8s' }}
      >
        <span
          className="text-[14px] font-semibold tracking-wide"
          style={{ color: '#35D6A0' }}
        >
          <span className="mr-1">✓</span>
          IDENTITY VERIFIED
        </span>
      </div>

      {/* Main heading */}
      <h1
        className={`relative z-10 mt-4 text-center transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
        style={{
          transitionDelay: '1.0s',
          fontSize: '30px',
          fontWeight: 700,
          color: '#F5F7FA',
          lineHeight: 1.2,
        }}
      >
        Your account is verified.
      </h1>

      {/* Supporting text */}
      <p
        className={`relative z-10 mt-4 text-center max-w-xs transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
        style={{
          transitionDelay: '1.2s',
          fontSize: '16px',
          fontWeight: 400,
          color: '#9AA4B5',
          lineHeight: 1.5,
        }}
      >
        Your VirgoPlay creator portal is now live.
        <br />
        You can start creating, customizing, and building your AI character experience.
      </p>

      {/* Journey message */}
      <p
        className={`relative z-10 mt-6 text-center transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
        style={{
          transitionDelay: '1.4s',
          fontSize: '15px',
          fontWeight: 600,
          color: '#35D6A0',
        }}
      >
        Your AI journey starts here.
      </p>

      {/* Scroll indicator */}
      <div
        className={`relative z-10 mt-8 flex flex-col items-center gap-1 transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
        style={{ transitionDelay: '1.6s' }}
      >
        <ChevronDown className="w-4 h-4 vhero-scroll-chevron" style={{ color: '#9AA4B5' }} />
        <ChevronDown className="w-4 h-4 vhero-scroll-chevron" style={{ color: '#9AA4B5', animationDelay: '0.2s' }} />
      </div>
    </div>
  );
}

function ChevronDown({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
