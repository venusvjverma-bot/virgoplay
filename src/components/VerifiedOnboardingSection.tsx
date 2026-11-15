import { useEffect, useRef, useState } from 'react';

export default function VerifiedOnboardingSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          setVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center bg-surface-950 px-6 py-14 overflow-hidden"
    >
      {/* Subtle top divider glow connecting to the hero above */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(53,214,160,0.25), transparent)' }}
      />

      {/* Small label — YOUR AI CHARACTER */}
      <div
        className={`relative z-10 transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
      >
        <span
          className="uppercase"
          style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '1.8px', color: '#35D6A0' }}
        >
          YOUR AI CHARACTER
        </span>
      </div>

      {/* Main heading — Create your AI your way. */}
      <h2
        className={`relative z-10 mt-5 text-center transition-all duration-[450ms] ease-out ${
          visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[20px]'
        }`}
        style={{ fontSize: '30px', fontWeight: 700, color: '#F5F7FA', lineHeight: 1.15, transitionDelay: '250ms' }}
      >
        Create your AI your way.
      </h2>

      {/* Description */}
      <p
        className={`relative z-10 mt-4 text-center max-w-sm transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'
        }`}
        style={{ fontSize: '16px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5, transitionDelay: '550ms' }}
      >
        Customize your own AI character and shape their appearance to match your vision.
      </p>

      {/* Options row */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-0 w-full max-w-sm">
        {/* First option — CUSTOMIZE YOUR AI (enters from left) */}
        <div
          className={`w-full flex flex-col items-center text-center transition-all duration-[400ms] ease-out ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[24px]'
          }`}
          style={{ transitionDelay: '900ms' }}
        >
          <h3 style={{ fontSize: '17px', fontWeight: 650, color: '#F5F7FA' }}>
            CUSTOMIZE YOUR AI
          </h3>
          <p className="mt-1.5" style={{ fontSize: '15px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5 }}>
            Create and personalize your own AI character.
          </p>
          {/* Accent line that grows */}
          <div
            className="mt-4 h-px"
            style={{
              backgroundColor: '#35D6A0',
              width: visible ? '60px' : '0px',
              transition: 'width 0.4s ease-out 1100ms',
            }}
          />
        </div>

        {/* OR divider */}
        <div
          className={`my-5 transition-opacity duration-[250ms] ease-out ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '1200ms' }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#667085' }}>OR</span>
        </div>

        {/* Second option — CHOOSE FROM VIRGOPLAY (enters from right) */}
        <div
          className={`w-full flex flex-col items-center text-center transition-all duration-[400ms] ease-out ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-[24px]'
          }`}
          style={{ transitionDelay: '1100ms' }}
        >
          <h3 style={{ fontSize: '17px', fontWeight: 650, color: '#F5F7FA' }}>
            CHOOSE FROM VIRGOPLAY
          </h3>
          <p className="mt-1.5" style={{ fontSize: '15px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5 }}>
            Choose an AI character from VirgoPlay.
          </p>
          {/* Accent line that grows */}
          <div
            className="mt-4 h-px"
            style={{
              backgroundColor: '#35D6A0',
              width: visible ? '60px' : '0px',
              transition: 'width 0.4s ease-out 1300ms',
            }}
          />
        </div>
      </div>

      {/* Final message */}
      <p
        className={`relative z-10 mt-10 text-center transition-all duration-[350ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
        style={{ fontSize: '17px', fontWeight: 600, color: '#35D6A0', transitionDelay: '1600ms' }}
      >
        Your character. Your choice.
      </p>

      {/* Scroll indicator */}
      <div
        className={`relative z-10 mt-6 flex flex-col items-center gap-1 transition-opacity duration-[300ms] ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '1950ms' }}
      >
        <ChevronDown className="w-4 h-4 vhero-scroll-chevron" style={{ color: '#9AA4B5' }} />
        <ChevronDown className="w-4 h-4 vhero-scroll-chevron" style={{ color: '#9AA4B5', animationDelay: '0.2s' }} />
      </div>
    </section>
  );
}

function ChevronDown({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
