import { useEffect, useRef, useState } from 'react';

export default function VerifiedExperienceSection() {
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
      {/* Subtle top divider glow connecting to Section 2 above */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(53,214,160,0.25), transparent)' }}
      />

      {/* Small label — CREATE YOUR EXPERIENCE */}
      <div
        className={`relative z-10 transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
      >
        <span
          className="uppercase"
          style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '1.8px', color: '#35D6A0' }}
        >
          CREATE YOUR EXPERIENCE
        </span>
      </div>

      {/* Main heading */}
      <h2
        className={`relative z-10 mt-5 text-center max-w-md transition-all duration-[500ms] ease-out ${
          visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[20px]'
        }`}
        style={{ fontSize: '30px', fontWeight: 700, color: '#F5F7FA', lineHeight: 1.15, transitionDelay: '250ms' }}
      >
        One AI character. Many different experiences.
      </h2>

      {/* Main description */}
      <p
        className={`relative z-10 mt-4 text-center max-w-sm transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'
        }`}
        style={{ fontSize: '16px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5, transitionDelay: '550ms' }}
      >
        Your AI character can take on different roles while keeping the same core identity. Choose a role and create unique scenes to bring each experience to life.
      </p>

      {/* Role + Scene sections with connection line */}
      <div className="relative z-10 mt-10 w-full max-w-sm flex flex-col items-center">
        {/* CHOOSE A ROLE — enters from left */}
        <div
          className={`w-full flex flex-col items-center text-center transition-all duration-[450ms] ease-out ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[24px]'
          }`}
          style={{ transitionDelay: '900ms' }}
        >
          <h3 style={{ fontSize: '17px', fontWeight: 650, color: '#F5F7FA' }}>
            CHOOSE A ROLE
          </h3>
          <p className="mt-2 max-w-xs" style={{ fontSize: '15px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5, transitionDelay: '1020ms', transitionDuration: '400ms', transitionTimingFunction: 'ease-out', transitionProperty: visible ? 'all' : 'all' }}>
            Select a role for your AI character. Each role gives your character a different personality, context, and type of experience for your audience.
          </p>
          <p
            className={`mt-3 transition-opacity duration-[400ms] ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
            style={{ fontSize: '15px', fontWeight: 500, color: '#35D6A0', transitionDelay: '1140ms' }}
          >
            The same character can have multiple roles.
          </p>
        </div>

        {/* Connection line with traveling glow point */}
        <div className="relative my-5 w-px h-12 flex items-center justify-center" style={{ overflow: 'visible' }}>
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-px"
            style={{
              height: visible ? '48px' : '0px',
              backgroundColor: 'rgba(53,214,160,0.3)',
              transition: 'height 0.5s ease-out 1200ms',
            }}
          />
          {/* Traveling glow point */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: '#35D6A0',
              boxShadow: '0 0 8px rgba(53,214,160,0.7)',
              top: visible ? '48px' : '0px',
              opacity: visible ? 0 : 1,
              transition: 'top 0.6s ease-out 1500ms, opacity 0.3s ease-in 2100ms',
            }}
          />
        </div>

        {/* CREATE A SCENE — enters from right */}
        <div
          className={`w-full flex flex-col items-center text-center transition-all duration-[400ms] ease-out ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-[24px]'
          }`}
          style={{ transitionDelay: '1050ms' }}
        >
          <h3 style={{ fontSize: '17px', fontWeight: 650, color: '#F5F7FA' }}>
            CREATE A SCENE
          </h3>
          <p
            className={`mt-2 max-w-xs transition-all duration-[400ms] ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[6px]'}`}
            style={{ fontSize: '15px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5, transitionDelay: '1170ms' }}
          >
            Once you choose a role, create scenes around that experience. Your selected character and role are carried into the scene generation process.
          </p>
          <p
            className={`mt-3 transition-opacity duration-[400ms] ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
            style={{ fontSize: '15px', fontWeight: 500, color: '#35D6A0', transitionDelay: '1290ms' }}
          >
            Choose the role. Create the scene. Bring the experience to life.
          </p>
        </div>
      </div>

      {/* Consistency message */}
      <div
        className={`relative z-10 mt-10 flex flex-col items-center text-center transition-all duration-[300ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
        style={{ transitionDelay: '1500ms' }}
      >
        <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#F5F7FA' }}>
          Your character identity stays consistent.
        </h3>
        <p className="mt-2 max-w-xs" style={{ fontSize: '15px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.5 }}>
          You can create multiple roles and scenes while keeping your chosen AI character as the foundation.
        </p>
      </div>

      {/* Final message */}
      <p
        className={`relative z-10 mt-8 text-center transition-all duration-[300ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
        style={{ fontSize: '18px', fontWeight: 600, color: '#35D6A0', transitionDelay: '1900ms' }}
      >
        One character. Multiple roles. Endless experiences.
      </p>

      {/* Scroll indicator */}
      <div
        className={`relative z-10 mt-6 flex flex-col items-center gap-1 transition-opacity duration-[300ms] ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '2200ms' }}
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
