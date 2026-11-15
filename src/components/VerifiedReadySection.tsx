import { useEffect, useRef, useState } from 'react';

export default function VerifiedReadySection() {
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
      {/* Subtle top divider glow connecting to the section above */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px transition-opacity duration-[400ms] ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'linear-gradient(90deg, transparent, rgba(53,214,160,0.25), transparent)' }}
      />

      {/* Small vertical green divider */}
      <div
        className={`relative z-10 transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
      >
        <div className="w-px h-8 mx-auto" style={{ backgroundColor: 'rgba(53,214,160,0.3)' }} />
      </div>

      {/* Small label — YOUR EXPERIENCE IS READY */}
      <div
        className={`relative z-10 mt-3 transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
        style={{ transitionDelay: '100ms' }}
      >
        <span
          className="uppercase"
          style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '0.14em', color: '#35D6A0' }}
        >
          YOUR EXPERIENCE IS READY
        </span>
      </div>

      {/* Main heading */}
      <h2
        className={`relative z-10 mt-8 text-center max-w-xl transition-all duration-[500ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'
        }`}
        style={{ fontSize: '42px', fontWeight: 700, color: '#F5F7FA', lineHeight: 1.15, transitionDelay: '300ms' }}
      >
        Create it. Share it. Let your audience experience it.
      </h2>

      {/* Supporting text */}
      <p
        className={`relative z-10 mt-6 text-center max-w-lg transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'
        }`}
        style={{ fontSize: '20px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.55, transitionDelay: '550ms' }}
      >
        Once your character, role, scenes, images, and videos are ready, your chat link is available in the Client section. Share it directly with your audience or publish your experience to the VirgoPlay Library.
      </p>

      {/* SHARE YOUR CHAT panel */}
      <div
        className={`relative z-10 mt-12 w-full max-w-md transition-all duration-[450ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[14px]'
        }`}
        style={{ transitionDelay: '850ms' }}
      >
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(53,214,160,0.15)',
            boxShadow: '0 0 24px rgba(53,214,160,0.05)',
          }}
        >
          <h3
            className="uppercase"
            style={{ fontSize: '24px', fontWeight: 700, color: '#F5F7FA', letterSpacing: '0.04em' }}
          >
            SHARE YOUR CHAT
          </h3>
          <p
            className="mt-4"
            style={{ fontSize: '17px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.55 }}
          >
            Give your audience a direct way to enter your roleplay experience. Share your unique chat link with your audience or anyone you choose.
          </p>
          <p
            className="mt-5"
            style={{ fontSize: '18px', fontWeight: 600, color: '#35D6A0' }}
          >
            One link. Many opportunities.
          </p>
        </div>
      </div>

      {/* VIRGOPLAY LIBRARY panel */}
      <div
        className={`relative z-10 mt-6 w-full max-w-md transition-all duration-[450ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[14px]'
        }`}
        style={{ transitionDelay: '1050ms' }}
      >
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(53,214,160,0.15)',
            boxShadow: '0 0 24px rgba(53,214,160,0.05)',
          }}
        >
          <h3
            className="uppercase"
            style={{ fontSize: '24px', fontWeight: 700, color: '#F5F7FA', letterSpacing: '0.04em' }}
          >
            VIRGOPLAY LIBRARY
          </h3>
          <p
            className="mt-4"
            style={{ fontSize: '17px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.55 }}
          >
            Publish your experience to the VirgoPlay Library — a public roleplay destination where people can discover characters, explore different roles, and start new experiences.
          </p>
          <p
            className="mt-5"
            style={{ fontSize: '18px', fontWeight: 600, color: '#35D6A0' }}
          >
            Your creativity. A wider audience.
          </p>
        </div>
      </div>

      {/* Small vertical green divider before final statement */}
      <div
        className={`relative z-10 mt-12 transition-all duration-[400ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[10px]'
        }`}
        style={{ transitionDelay: '1300ms' }}
      >
        <div className="w-px h-8 mx-auto" style={{ backgroundColor: 'rgba(53,214,160,0.3)' }} />
      </div>

      {/* Final statement */}
      <div
        className={`relative z-10 mt-8 text-center transition-all duration-[450ms] ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'
        }`}
        style={{ transitionDelay: '1450ms' }}
      >
        <h3
          style={{ fontSize: '31px', fontWeight: 700, color: '#35D6A0', lineHeight: 1.2 }}
        >
          One experience. One link.
          <br />
          Endless possibilities.
        </h3>
        <p
          className="mt-4"
          style={{ fontSize: '17px', fontWeight: 400, color: '#9AA4B5', lineHeight: 1.55 }}
        >
          Create once. Share everywhere. Earn from your experiences.
        </p>
      </div>
    </section>
  );
}
