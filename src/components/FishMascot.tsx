import './FishMascot.css';

interface FishMascotProps {
  size?: number;
  className?: string;
}

/**
 * Small red fish mascot rendered as inline SVG.
 * Continuous tail wag + subtle vertical swim bob via CSS.
 */
export default function FishMascot({ size = 36, className = '' }: FishMascotProps) {
  return (
    <svg
      className={`fish-mascot ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fish-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="fish-tail-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <linearGradient id="fish-fin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>

      <g className="fish-mascot__body">
        {/* Tail */}
        <g className="fish-mascot__tail">
          <path
            d="M22 30 L4 16 L10 30 L4 44 Z"
            fill="url(#fish-tail-grad)"
            stroke="#991b1b"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </g>

        {/* Top fin */}
        <g className="fish-mascot__top-fin">
          <path
            d="M45 16 Q52 4 62 16 Z"
            fill="url(#fish-fin)"
            stroke="#991b1b"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </g>

        {/* Body */}
        <ellipse
          cx="55"
          cy="30"
          rx="33"
          ry="18"
          fill="url(#fish-body)"
          stroke="#991b1b"
          strokeWidth="1"
        />

        {/* Belly highlight */}
        <ellipse
          cx="55"
          cy="36"
          rx="26"
          ry="9"
          fill="#fca5a5"
          opacity="0.35"
        />

        {/* Eye */}
        <circle cx="78" cy="26" r="3.5" fill="#fff" />
        <circle cx="79" cy="26" r="2" fill="#1e1b4b" />
        <circle cx="79.5" cy="25.2" r="0.7" fill="#fff" />

        {/* Mouth */}
        <path
          d="M86 32 Q90 33 88 36"
          stroke="#991b1b"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Gill line */}
        <path
          d="M68 18 Q66 30 68 42"
          stroke="#b91c1c"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}
