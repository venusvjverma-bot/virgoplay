import './RobotMascot.css';

interface RobotMascotProps {
  size?: number;
  className?: string;
}

/**
 * Small 3D-style robot mascot rendered as inline SVG.
 * Subtle looping idle animation via CSS (head tilt, body bob, hand/foot motion, blink).
 */
export default function RobotMascot({ size = 72, className = '' }: RobotMascotProps) {
  return (
    <svg
      className={`robot-mascot ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="robot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </linearGradient>
        <linearGradient id="robot-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </linearGradient>
        <linearGradient id="robot-accent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id="robot-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
        <filter id="robot-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#6366f1" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="50" cy="92" rx="22" ry="3" fill="#a5b4fc" opacity="0.25" />

      <g filter="url(#robot-shadow)">
        {/* Antenna */}
        <line x1="50" y1="14" x2="50" y2="8" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="50" cy="7" r="2.5" fill="url(#robot-accent)" />

        {/* Head */}
        <g className="robot-mascot__head">
          <rect x="28" y="14" width="44" height="34" rx="12" fill="url(#robot-head)" stroke="#a5b4fc" strokeWidth="1" />
          {/* Face screen */}
          <rect x="34" y="20" width="32" height="22" rx="8" fill="#1e1b4b" opacity="0.92" />
          {/* Eyes */}
          <g className="robot-mascot__eye">
            <circle cx="42" cy="31" r="3.2" fill="url(#robot-eye)" />
            <circle cx="42" cy="30" r="1" fill="#fff" opacity="0.85" />
          </g>
          <g className="robot-mascot__eye">
            <circle cx="58" cy="31" r="3.2" fill="url(#robot-eye)" />
            <circle cx="58" cy="30" r="1" fill="#fff" opacity="0.85" />
          </g>
          {/* Mouth */}
          <path d="M44 38 Q50 41 56 38" stroke="#a5b4fc" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* Ears */}
          <circle cx="27" cy="31" r="3" fill="url(#robot-accent)" />
          <circle cx="73" cy="31" r="3" fill="url(#robot-accent)" />
        </g>

        {/* Body */}
        <rect x="33" y="48" width="34" height="28" rx="10" fill="url(#robot-body)" stroke="#a5b4fc" strokeWidth="1" />
        {/* Chest light */}
        <circle cx="50" cy="60" r="3.5" fill="url(#robot-accent)" />
        <circle cx="50" cy="60" r="1.5" fill="#fff" opacity="0.7" />

        {/* Hands */}
        <g className="robot-mascot__hand-left">
          <circle cx="72" cy="56" r="4" fill="url(#robot-head)" stroke="#a5b4fc" strokeWidth="0.8" />
        </g>
        <g className="robot-mascot__hand-right">
          <circle cx="28" cy="56" r="4" fill="url(#robot-head)" stroke="#a5b4fc" strokeWidth="0.8" />
        </g>

        {/* Feet */}
        <g className="robot-mascot__foot-left">
          <rect x="38" y="76" width="10" height="6" rx="3" fill="url(#robot-accent)" />
        </g>
        <g className="robot-mascot__foot-right">
          <rect x="52" y="76" width="10" height="6" rx="3" fill="url(#robot-accent)" />
        </g>
      </g>
    </svg>
  );
}
