import { useEffect, useState } from "react";

function Face({ closed }: { closed: boolean }) {
  return (
    <svg width="82" height="82" viewBox="0 0 64 64" aria-hidden="true" className="pip-face">
      <defs>
        {/* Body — dimensional lavender-to-blue */}
        <radialGradient id="pipBody" cx="33%" cy="26%" r="90%">
          <stop offset="0%" stopColor="#e4dcff" />
          <stop offset="28%" stopColor="#b9a5f7" />
          <stop offset="62%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4c33a8" />
        </radialGradient>
        <radialGradient id="pipSheen" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pipSheenSoft" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pipRim" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0" />
          <stop offset="72%" stopColor="#c7d2fe" stopOpacity="0" />
          <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id="pipBounce" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </radialGradient>

        {/* Eyes — deep violet-blue with layered iris */}
        <radialGradient id="pipIris" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#6d5ae0" />
          <stop offset="45%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
        <radialGradient id="pipPupil" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#0f0a24" />
        </radialGradient>
        <radialGradient id="pipEyeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </radialGradient>

        {/* Cheeks */}
        <radialGradient id="pipCheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb9dbc" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#fb9dbc" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fb9dbc" stopOpacity="0" />
        </radialGradient>

        {/* Mouth */}
        <radialGradient id="pipMouth" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7e22ce" />
        </radialGradient>

        <filter id="pipDrop" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2e1065" floodOpacity="0.5" />
        </filter>
        <filter id="pipInnerShade" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* Body sphere with depth */}
      <g filter="url(#pipDrop)">
        <circle cx="32" cy="32" r="29" fill="url(#pipBody)" />
        {/* Soft occlusion shadow under the face plane */}
        <ellipse cx="32" cy="47" rx="20" ry="10" fill="#3b2a86" opacity="0.35" filter="url(#pipInnerShade)" />
        {/* Bottom bounce light */}
        <ellipse cx="32" cy="54" rx="17" ry="7" fill="url(#pipBounce)" />
        {/* Rim lighting — restrained purple-blue edge glow */}
        <circle cx="32" cy="32" r="28.4" fill="none" stroke="url(#pipRim)" strokeWidth="2.4" />
        {/* Primary glossy highlight — upper left */}
        <ellipse cx="21.5" cy="17.5" rx="12.5" ry="7.5" fill="url(#pipSheen)" transform="rotate(-22 21.5 17.5)" />
        {/* Secondary soft reflection — upper right */}
        <ellipse cx="44" cy="21" rx="6" ry="3.4" fill="url(#pipSheenSoft)" transform="rotate(24 44 21)" />
      </g>

      {/* Cheeks — soft rosy */}
      <ellipse cx="13.5" cy="37.5" rx="7.2" ry="4.8" fill="url(#pipCheek)" />
      <ellipse cx="50.5" cy="37.5" rx="7.2" ry="4.8" fill="url(#pipCheek)" />

      {closed ? (
        <g className="pip-eyes-closed">
          <path d="M17.5 29.5c2.6-3.8 7.8-3.8 10.4 0" fill="none" stroke="#241a3e" strokeWidth="3" strokeLinecap="round" />
          <path d="M36.1 29.5c2.6-3.8 7.8-3.8 10.4 0" fill="none" stroke="#241a3e" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : (
        <g className="pip-eyes-open">
          {/* Eye sockets — subtle recessed shading */}
          <ellipse cx="22.7" cy="28.6" rx="5.6" ry="7.4" fill="#4c33a8" opacity="0.35" />
          <ellipse cx="41.3" cy="28.6" rx="5.6" ry="7.4" fill="#4c33a8" opacity="0.35" />
          {/* Layered iris */}
          <ellipse cx="22.7" cy="28.6" rx="4.6" ry="6.2" fill="url(#pipIris)" />
          <ellipse cx="41.3" cy="28.6" rx="4.6" ry="6.2" fill="url(#pipIris)" />
          {/* Inner glow ring around the pupil */}
          <ellipse cx="22.7" cy="28.6" rx="3.4" ry="4.6" fill="url(#pipEyeGlow)" />
          <ellipse cx="41.3" cy="28.6" rx="3.4" ry="4.6" fill="url(#pipEyeGlow)" />
          {/* Pupils */}
          <ellipse cx="22.7" cy="29.4" rx="1.9" ry="2.7" fill="url(#pipPupil)" />
          <ellipse cx="41.3" cy="29.4" rx="1.9" ry="2.7" fill="url(#pipPupil)" />
          {/* Primary catchlights */}
          <circle cx="21.2" cy="26.2" r="1.5" fill="#ffffff" />
          <circle cx="39.8" cy="26.2" r="1.5" fill="#ffffff" />
          {/* Secondary catchlights — small lower reflections */}
          <circle cx="24.3" cy="31.6" r="0.7" fill="#ffffff" opacity="0.75" />
          <circle cx="42.9" cy="31.6" r="0.7" fill="#ffffff" opacity="0.75" />
        </g>
      )}

      {/* Small friendly mouth — open smile with depth */}
      <path
        d="M26 42.2c1.6 3.6 10.4 3.6 12 0c-2 1.6-10 1.6-12 0z"
        fill="url(#pipMouth)"
      />
      <path d="M26.6 42c1.8 1 9 1 10.8 0" fill="none" stroke="#f3e8ff" strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

interface Tip {
  closed: boolean;
  line: string;
  top: number;
  left: number;
}

export function Pip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    const lineFor = (el: HTMLInputElement): { closed: boolean; line: string } | null => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "password") return { closed: true, line: "Type your password. I will not look." };
      if (type === "email") return { closed: false, line: "Your email goes in this box." };
      return null;
    };
    const show = (el: HTMLInputElement) => {
      const hint = lineFor(el);
      if (!hint) return;
      clearTimeout(timer);
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      setTip({
        ...hint,
        top: r.top + (vv?.offsetTop ?? 0) - 8,
        left: r.right + (vv?.offsetLeft ?? 0) - 14,
      });
    };
    const onIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) show(e.target);
    };
    const onOut = () => {
      timer = window.setTimeout(() => {
        if (!(document.activeElement instanceof HTMLInputElement)) setTip(null);
      }, 40);
    };
    const move = () => {
      if (document.activeElement instanceof HTMLInputElement) show(document.activeElement);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", move, true);
    window.visualViewport?.addEventListener("resize", move);
    window.visualViewport?.addEventListener("scroll", move);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", move, true);
      window.visualViewport?.removeEventListener("resize", move);
      window.visualViewport?.removeEventListener("scroll", move);
    };
  }, []);

  if (!tip) return null;
  return (
    <div style={{ position: "fixed", top: tip.top, left: tip.left, transform: "translate(-100%, -100%)", zIndex: 80, pointerEvents: "none", display: "flex", alignItems: "center", gap: 4 }}>
      <style>{`
        .pip-bubble {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 45%, #6366f1 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 14px;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.35;
          max-width: 210px;
          box-shadow:
            0 6px 22px rgba(109, 40, 217, 0.45),
            0 2px 6px rgba(49, 16, 130, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.28);
          text-shadow: 0 1px 2px rgba(30, 10, 80, 0.35);
          position: relative;
        }
        .pip-bubble::after {
          content: "";
          position: absolute;
          right: -5px;
          top: 50%;
          width: 10px;
          height: 10px;
          margin-top: -5px;
          background: #7c3aed;
          border-right: 1px solid rgba(255, 255, 255, 0.22);
          border-top: 1px solid rgba(255, 255, 255, 0.22);
          transform: rotate(45deg);
          border-radius: 2px;
        }
        .pip-face {
          animation: pip-float 3.4s ease-in-out infinite;
        }
        .pip-eyes-open {
          transform-origin: 32px 29px;
          animation: pip-blink 4.2s ease-in-out infinite;
        }
        @keyframes pip-blink {
          0%, 91%, 100% { transform: scaleY(1); }
          94%, 96% { transform: scaleY(0.06); }
          98% { transform: scaleY(1); }
        }
        @keyframes pip-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2.5px); }
        }
      `}</style>
      <div className="pip-bubble">
        {tip.line}
      </div>
      <Face closed={tip.closed} />
    </div>
  );
}
