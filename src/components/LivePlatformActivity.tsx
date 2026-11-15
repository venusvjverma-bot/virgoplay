import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Cinematic text segments ───────────────────────────────────────────────

interface CinematicSegment {
  startSec: number;
  endSec: number;
  text: string;
}

const SEGMENTS: CinematicSegment[] = [
  { startSec: 2,  endSec: 5,  text: 'Designed for endless roleplay.' },
  { startSec: 6,  endSec: 9,  text: 'Discover immersive stories. Create unforgettable experiences.' },
  { startSec: 10, endSec: 13, text: 'Create a role. Discover countless possibilities.' },
  { startSec: 14, endSec: 17, text: 'One character. Multiple roles. Infinite stories.' },
  { startSec: 18, endSec: 21, text: 'Built for creators. Made for discovery.' },
  { startSec: 22, endSec: 24, text: 'Your next story starts here.' },
  { startSec: 25, endSec: 29, text: 'Coming soon: Personalized Adult AI Assistants for your fans.' },
];

// Shared ref written by the text component (the runtime driver).
// The canvas reads this each frame — no React re-renders for the sphere.
interface CinematicState {
  // 0 = resting, 1 = fully active. Smoothly ramped by the text component.
  intensity: number;
  // Index of the currently-displaying segment, or -1 during gaps.
  segmentIndex: number;
  // Monotonic counter incremented when a new segment starts.
  // The canvas detects the change and fires a wave pulse.
  segmentEpoch: number;
}

// ─── Metrics (unchanged) ───────────────────────────────────────────────────

interface Metrics {
  activeClients: number;
  verifiedCreators: number;
  rolesPublished: number;
}

function formatVisitCount(n: number): string {
  return n.toLocaleString('en-US');
}

function useCountUp(target: number, active: boolean, duration = 1600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    if (target === 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, duration]);

  return value;
}

// ─── Particle system ───────────────────────────────────────────────────────
//
// One continuous flow simulation. Each particle has:
//   - base position on a unit sphere (resting)
//   - velocity (3D) that is steered by a flow field
//   - the flow field direction slowly rotates over time
//
// When cinematic intensity is 0, particles stay on their base positions
// and the sphere performs its normal 360° rotation.
//
// When intensity > 0, the flow field activates and particles are gently
// steered along smooth currents. A wave pulse travels through the sphere
// each time a new text line begins.

interface Particle {
  // Base position on unit sphere (resting)
  bx: number;
  by: number;
  bz: number;
  baseR: number;
  sizeClass: 0 | 1 | 2;
  colorBias: number;
  phase: number;
  // Current animated position (offset from base)
  ox: number;
  oy: number;
  oz: number;
  // Velocity
  vx: number;
  vy: number;
  vz: number;
  // Trail (previous screen pos)
  prevSx: number;
  prevSy: number;
  hasPrev: boolean;
}

function ParticleSphere({ cinemaRef }: { cinemaRef: React.RefObject<CinematicState> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const setSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();

    const onResize = () => setSize();
    window.addEventListener('resize', onResize);

    const N = 380;
    const particles: Particle[] = [];

    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const roll = Math.random();
      let r: number;
      if (roll < 0.55) {
        r = 0.88 + Math.random() * 0.12;
      } else if (roll < 0.9) {
        const u = Math.random();
        r = Math.cbrt(u) * 0.82;
      } else {
        r = 1.02 + Math.random() * 0.12;
      }

      const sizeRoll = Math.random();
      let sizeClass: 0 | 1 | 2 = 0;
      if (sizeRoll > 0.93) sizeClass = 2;
      else if (sizeRoll > 0.6) sizeClass = 1;

      const bx = r * Math.sin(phi) * Math.cos(theta);
      const by = r * Math.sin(phi) * Math.sin(theta);
      const bz = r * Math.cos(phi);

      particles.push({
        bx, by, bz,
        baseR: r,
        sizeClass,
        colorBias: Math.random(),
        phase: Math.random() * Math.PI * 2,
        ox: 0, oy: 0, oz: 0,
        vx: 0, vy: 0, vz: 0,
        prevSx: 0, prevSy: 0, hasPrev: false,
      });
    }

    // Resting rotation state — continuous 360°
    const ROT_SPEED_Y = (Math.PI * 2) / 20; // one rotation / 20s
    const ROT_SWAY_X = 0.35;
    let rotY = 0;

    // Smoothed intensity (the canvas eases toward the ref value)
    let smoothIntensity = 0;
    // Wave pulse — decays from 1 to 0 after each segment change
    let wavePulse = 0;
    let wavePulseTime = 0;
    let lastEpoch = -1;

    // Flow field direction — slowly rotates
    let flowTime = 0;
    let lastNow = performance.now();

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - lastNow) / 1000, 0.05); // clamp dt for stability
      lastNow = now;
      const elapsed = now / 1000;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.38;

      // Read cinematic state from ref (written by text component)
      const cs = cinemaRef.current;
      const targetIntensity = cs ? cs.intensity : 0;
      const currentEpoch = cs ? cs.segmentEpoch : -1;

      // Detect segment change → fire wave pulse
      if (currentEpoch !== lastEpoch && currentEpoch >= 0) {
        wavePulse = 1;
        wavePulseTime = 0;
        lastEpoch = currentEpoch;
      }

      // Smooth intensity toward target (ease in/out over ~0.8s)
      const intensityLerp = 1 - Math.exp(-dt * 2.5);
      smoothIntensity += (targetIntensity - smoothIntensity) * intensityLerp;

      // Wave pulse decays over ~1.2s
      wavePulseTime += dt;
      if (wavePulse > 0) {
        wavePulse = Math.max(0, 1 - wavePulseTime / 1.2);
      }

      // Resting rotation always runs
      rotY += ROT_SPEED_Y * dt;
      const angleY = rotY;
      const angleX = Math.sin(rotY) * ROT_SWAY_X;

      // Flow field evolves with time
      flowTime += dt * (0.5 + smoothIntensity * 1.5);

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      ctx.clearRect(0, 0, w, h);

      // ── Simulation step: steer particles along flow field ──
      const intensity = smoothIntensity;
      const wave = wavePulse;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Flow field: smooth sinusoidal currents in 3D
        // Direction varies by position and slowly over time
        const fx = Math.sin(flowTime * 0.7 + p.bx * 2.0 + p.phase) * Math.cos(flowTime * 0.5 + p.bz * 1.8);
        const fy = Math.cos(flowTime * 0.6 + p.by * 2.2 + p.phase * 1.3) * Math.sin(flowTime * 0.4 + p.bx * 1.5);
        const fz = Math.sin(flowTime * 0.8 + p.bz * 2.5 + p.phase * 0.7) * Math.cos(flowTime * 0.55 + p.by * 1.7);

        // Desired velocity from flow field (scaled by intensity)
        const flowScale = 0.6 * intensity;
        let desVx = fx * flowScale;
        let desVy = fy * flowScale;
        let desVz = fz * flowScale;

        // Wave pulse: a radial wave that expands outward from center
        // when a new text line begins
        if (wave > 0.001) {
          const waveSpeed = 2.0; // units per second
          const waveRadius = wavePulseTime * waveSpeed;
          const distFromCenter = p.baseR;
          const waveBand = Math.exp(-((distFromCenter - waveRadius) ** 2) * 8);
          const radialDir = p.baseR > 0.001 ? 1 / p.baseR : 0;
          desVx += p.bx * radialDir * waveBand * wave * 0.8;
          desVy += p.by * radialDir * waveBand * wave * 0.8;
          desVz += p.bz * radialDir * waveBand * wave * 0.8;
        }

        // Steering: velocity eases toward desired velocity (inertia + damping)
        const steer = 1 - Math.exp(-dt * 3.0);
        p.vx += (desVx - p.vx) * steer;
        p.vy += (desVy - p.vy) * steer;
        p.vz += (desVz - p.vz) * steer;

        // Update offset position
        p.ox += p.vx * dt;
        p.oy += p.vy * dt;
        p.oz += p.vz * dt;

        // Spring back toward base position (keeps sphere coherent)
        const spring = 1 - Math.exp(-dt * 2.0);
        p.ox += (0 - p.ox) * spring;
        p.oy += (0 - p.oy) * spring;
        p.oz += (0 - p.oz) * spring;

        // Damp velocity (prevents runaway)
        const damp = 1 - Math.exp(-dt * 1.5);
        p.vx *= (1 - damp);
        p.vy *= (1 - damp);
        p.vz *= (1 - damp);
      }

      // ── Project and render ──
      const projected = particles.map((p) => {
        const px = p.bx + p.ox;
        const py = p.by + p.oy;
        const pz = p.bz + p.oz;

        let rx = px * cosY - pz * sinY;
        let rz = px * sinY + pz * cosY;
        const ry = py * cosX - rz * sinX;
        rz = py * sinX + rz * cosX;

        const scale = (rz + 2.6) / 3.6;
        return {
          sx: cx + rx * radius * scale,
          sy: cy + ry * radius * scale,
          depth: scale,
          p,
          speed: Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz),
        };
      });

      projected.sort((a, b) => a.depth - b.depth);

      // Connection lines — bright nodes only
      const brightIdx: number[] = [];
      for (let i = 0; i < projected.length; i++) {
        if (projected[i].p.sizeClass === 2 && projected[i].depth > 0.4) {
          brightIdx.push(i);
        }
      }
      for (let a = 0; a < brightIdx.length; a++) {
        const i = brightIdx[a];
        for (let b = a + 1; b < brightIdx.length; b++) {
          const j = brightIdx[b];
          const dx = projected[i].p.bx - projected[j].p.bx;
          const dy = projected[i].p.by - projected[j].p.by;
          const dz = projected[i].p.bz - projected[j].p.bz;
          const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist3d < 0.55) {
            const opacity = (1 - dist3d / 0.55) * 0.12 * Math.min(projected[i].depth, projected[j].depth);
            ctx.strokeStyle = `rgba(148, 130, 245, ${opacity})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            ctx.moveTo(projected[i].sx, projected[i].sy);
            ctx.lineTo(projected[j].sx, projected[j].sy);
            ctx.stroke();
          }
        }
      }

      // Particles + trails
      const trailStrength = intensity * 0.5;

      for (const item of projected) {
        const { sx, sy, depth, p, speed } = item;
        const twinkle = 0.85 + 0.15 * Math.sin(elapsed * 1.5 + p.phase);
        const baseOpacity = (0.12 + depth * 0.78) * twinkle;

        let cr: number, cg: number, cb: number;
        if (p.colorBias > 0.88) {
          cr = 130; cg = 200; cb = 235;
        } else if (p.colorBias > 0.55) {
          cr = 196; cg = 181; cb = 253;
        } else {
          cr = 167; cg = 139; cb = 250;
        }

        // Short trail for fast-moving particles
        if (p.hasPrev && trailStrength > 0.02 && speed > 0.02) {
          const trailLen = Math.sqrt((sx - p.prevSx) ** 2 + (sy - p.prevSy) ** 2);
          if (trailLen > 0.3 && trailLen < 30) {
            const trailOpacity = Math.min(speed * trailStrength, 0.4) * depth;
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${trailOpacity})`;
            ctx.lineWidth = p.sizeClass === 2 ? 1.0 : p.sizeClass === 1 ? 0.7 : 0.35;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.prevSx, p.prevSy);
            ctx.lineTo(sx, sy);
            ctx.stroke();
          }
        }

        const velSizeBoost = Math.min(speed * 1.2, 1.2);

        if (p.sizeClass === 2) {
          const size = (1.8 + depth * 2.2) * twinkle + velSizeBoost;
          const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 5);
          glowGrad.addColorStop(0, `rgba(${cr},${cg},${cb},${baseOpacity * 0.4})`);
          glowGrad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${baseOpacity * 0.12})`);
          glowGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(baseOpacity * 1.6, 1)})`;
          ctx.fill();
          if (depth > 0.7) {
            ctx.beginPath();
            ctx.arc(sx, sy, size * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(245, 240, 255, ${depth * 0.8})`;
            ctx.fill();
          }
        } else if (p.sizeClass === 1) {
          const size = (1 + depth * 1.8) * twinkle + velSizeBoost * 0.6;
          if (depth > 0.55) {
            const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3.5);
            glowGrad.addColorStop(0, `rgba(${cr},${cg},${cb},${baseOpacity * 0.25})`);
            glowGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(sx, sy, size * 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${baseOpacity})`;
          ctx.fill();
        } else {
          const size = (0.4 + depth * 1.2) + velSizeBoost * 0.3;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${baseOpacity * 0.7})`;
          ctx.fill();
        }
      }

      // Save positions for next frame trails
      for (let i = 0; i < particles.length; i++) {
        particles[i].prevSx = projected[i].sx;
        particles[i].prevSy = projected[i].sy;
        particles[i].hasPrev = true;
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [cinemaRef]);

  return (
    <div className="relative w-full max-w-[320px] aspect-square mx-auto">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at center, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 40%, transparent 70%)',
      }} />
      <canvas ref={canvasRef} className="relative w-full h-full" />
    </div>
  );
}

// ─── Cinematic text layer (the runtime driver) ─────────────────────────────
//
// This component owns the cinematic timeline. It writes intensity, segmentIndex,
// and segmentEpoch into the shared ref. The canvas reads these values each frame.
//
// The sequence runs once when the section enters the viewport, then the sphere
// returns to its resting state. It replays on re-entry.

interface TextState {
  segmentIndex: number;
  typedText: string;
  fadingOut: boolean;
}

// Timing: each segment is visible for 3s (4s for the last one).
// 1-second gap between segments. Total ~30s.
const SEGMENT_DURATIONS = [3, 3, 3, 3, 3, 2, 4]; // seconds each line is visible
const GAP_DURATION = 1; // seconds between lines
const PRE_DELAY = 2; // seconds before first line

function CinematicText({ cinemaRef, inView }: { cinemaRef: React.RefObject<CinematicState>; inView: boolean }) {
  const [textState, setTextState] = useState<TextState>({ segmentIndex: -1, typedText: '', fadingOut: false });
  const typingRafRef = useRef<number>(0);
  const sequenceRafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const epochRef = useRef(0);
  const runningRef = useRef(false);

  // Main sequence controller — starts when inView becomes true
  useEffect(() => {
    if (!inView) {
      // Stop sequence, reset to resting
      runningRef.current = false;
      cancelAnimationFrame(sequenceRafRef.current);
      cancelAnimationFrame(typingRafRef.current);
      startTimeRef.current = 0;
      if (cinemaRef.current) {
        cinemaRef.current.intensity = 0;
        cinemaRef.current.segmentIndex = -1;
      }
      setTextState({ segmentIndex: -1, typedText: '', fadingOut: false });
      return;
    }

    // Start sequence
    runningRef.current = true;
    const seqStart = performance.now();
    startTimeRef.current = seqStart;

    // Calculate absolute start/end times for each segment
    let cursor = PRE_DELAY;
    const segWindows: { start: number; end: number; gapEnd: number }[] = [];
    for (let i = 0; i < SEGMENTS.length; i++) {
      const start = cursor;
      const end = start + SEGMENT_DURATIONS[i];
      segWindows.push({ start, end, gapEnd: end + GAP_DURATION });
      cursor = end + GAP_DURATION;
    }
    const totalDuration = cursor;

    const tick = (now: number) => {
      if (!runningRef.current) return;
      const elapsed = (now - seqStart) / 1000;

      if (elapsed >= totalDuration) {
        // Sequence complete — return to resting
        if (cinemaRef.current) {
          cinemaRef.current.intensity = 0;
          cinemaRef.current.segmentIndex = -1;
        }
        setTextState({ segmentIndex: -1, typedText: '', fadingOut: false });
        runningRef.current = false;
        return;
      }

      // Find current segment
      let currentIdx = -1;
      let inGap = false;
      for (let i = 0; i < segWindows.length; i++) {
        if (elapsed >= segWindows[i].start && elapsed < segWindows[i].end) {
          currentIdx = i;
          break;
        }
        if (elapsed >= segWindows[i].end && elapsed < segWindows[i].gapEnd) {
          inGap = true;
          break;
        }
      }

      // Update cinematic state
      if (cinemaRef.current) {
        if (currentIdx >= 0) {
          // Active segment — ramp intensity up
          cinemaRef.current.intensity = 1;
          if (cinemaRef.current.segmentIndex !== currentIdx) {
            cinemaRef.current.segmentIndex = currentIdx;
            epochRef.current++;
            cinemaRef.current.segmentEpoch = epochRef.current;
          }
        } else if (inGap) {
          // In a gap — keep sphere active but no segment
          cinemaRef.current.segmentIndex = -1;
          // Intensity stays partially active during gaps so the sphere
          // doesn't fully stop between lines
          cinemaRef.current.intensity = 0.5;
        } else {
          // Pre-delay — resting
          cinemaRef.current.intensity = 0;
          cinemaRef.current.segmentIndex = -1;
        }
      }

      sequenceRafRef.current = requestAnimationFrame(tick);
    };

    sequenceRafRef.current = requestAnimationFrame(tick);

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(sequenceRafRef.current);
    };
  }, [inView, cinemaRef]);

  // Typing animation — triggered by segmentIndex changes in cinemaRef
  useEffect(() => {
    if (!inView) return;

    const POLL_MS = 80;
    let lastIdx = -1;

    const interval = setInterval(() => {
      const cs = cinemaRef.current;
      if (!cs) return;

      const currentIdx = cs.segmentIndex;

      if (currentIdx !== lastIdx) {
        const prevIdx = lastIdx;
        lastIdx = currentIdx;

        if (currentIdx === -1) {
          // Entering a gap — fade out current text
          if (prevIdx >= 0) {
            setTextState({ segmentIndex: prevIdx, typedText: SEGMENTS[prevIdx].text, fadingOut: true });
          } else {
            setTextState({ segmentIndex: -1, typedText: '', fadingOut: false });
          }
        } else {
          // New segment — start typing
          const seg = SEGMENTS[currentIdx];
          cancelAnimationFrame(typingRafRef.current);
          setTextState({ segmentIndex: currentIdx, typedText: '', fadingOut: false });

          const typingStart = performance.now();
          const fullText = seg.text;
          const charsPerSec = 45;
          const typingDuration = (fullText.length / charsPerSec) * 1000;

          const typeTick = (now: number) => {
            const elapsed = now - typingStart;
            const progress = Math.min(elapsed / typingDuration, 1);
            const charCount = Math.floor(progress * fullText.length);
            const typed = fullText.slice(0, charCount);
            setTextState({ segmentIndex: currentIdx, typedText: typed, fadingOut: false });
            if (progress < 1) {
              typingRafRef.current = requestAnimationFrame(typeTick);
            }
          };
          typingRafRef.current = requestAnimationFrame(typeTick);
        }
      }
    }, POLL_MS);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(typingRafRef.current);
    };
  }, [inView, cinemaRef]);

  const showText = textState.segmentIndex >= 0 && (textState.typedText.length > 0 || !textState.fadingOut);
  if (!showText && textState.typedText.length === 0) return null;

  return (
    <div
      className="mx-auto text-center px-4"
      style={{
        minHeight: '3.5em',
        maxWidth: '600px',
        opacity: textState.fadingOut ? 0 : 1,
        transition: 'opacity 0.8s ease',
      }}
    >
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontStyle: 'normal',
          fontWeight: 500,
          color: '#FFFFFF',
          fontSize: 'clamp(18px, 5vw, 22px)',
          lineHeight: 1.35,
          textAlign: 'center',
          margin: 0,
        }}
      >
        {textState.typedText}
      </p>
    </div>
  );
}

// ─── Metric counter (unchanged) ────────────────────────────────────────────

function MetricCounter({ labelTop, labelBottom, value, active }: { labelTop: string; labelBottom: string; value: number; active: boolean }) {
  const display = useCountUp(value, active);
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className="font-bold tabular-nums tracking-tight"
        style={{
          fontSize: 'clamp(28px, 8vw, 34px)',
          color: '#F5F7FA',
          lineHeight: 1,
          textShadow: '0 0 20px rgba(139,92,246,0.25)',
        }}
      >
        {display.toLocaleString()}
      </span>
      <div className="mt-2 flex flex-col items-center">
        <span
          className="font-medium uppercase"
          style={{
            fontSize: 'clamp(11px, 3vw, 13px)',
            color: '#AEB7C8',
            letterSpacing: '1.4px',
            lineHeight: 1.3,
          }}
        >
          {labelTop}
        </span>
        <span
          className="font-medium uppercase"
          style={{
            fontSize: 'clamp(11px, 3vw, 13px)',
            color: '#AEB7C8',
            letterSpacing: '1.4px',
            lineHeight: 1.3,
          }}
        >
          {labelBottom}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function LivePlatformActivity() {
  const [metrics, setMetrics] = useState<Metrics>({ activeClients: 0, verifiedCreators: 0, rolesPublished: 0 });
  const [pageVisits, setPageVisits] = useState<number | null>(null);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchVisits = async () => {
      try {
        const { data, error: visitsError } = await supabase
          .from('chat_library_page_visits')
          .select('visit_count')
          .maybeSingle();
        if (!cancelled && !visitsError && data) {
          setPageVisits(data.visit_count);
        }
      } catch {
        // non-critical — keep last known value
      }
    };
    fetchVisits();
    window.addEventListener('chat-library-visits-updated', fetchVisits);
    return () => {
      cancelled = true;
      window.removeEventListener('chat-library-visits-updated', fetchVisits);
    };
  }, []);

  // Shared cinematic state — written by CinematicText, read by ParticleSphere
  const cinemaRef = useRef<CinematicState>({
    intensity: 0,
    segmentIndex: -1,
    segmentEpoch: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clientsRes, creatorsRes, rolesRes] = await Promise.all([
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('creators').select('id, is_content_master, role', { count: 'exact' }).eq('verification_status', 'approved'),
          supabase.from('chat_library_listings').select('role_id', { count: 'exact', head: true }),
        ]);

        if (cancelled) return;

        const activeClients = clientsRes.count ?? 0;

        const creatorRows = (creatorsRes.data ?? []) as Array<{ is_content_master: boolean | null; role: string | null }>;
        const verifiedCreators = creatorRows.filter(
          (c) => c.is_content_master !== true && c.role !== 'admin',
        ).length;

        const rolesPublished = rolesRes.count ?? 0;

        setMetrics({ activeClients, verifiedCreators, rolesPublished });
      } catch {
        // silently leave zeros
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="mt-8 rounded-3xl px-6 py-10 sm:px-10" style={{ backgroundColor: '#0B1224' }}>
      {/* VIRGOPLAY LIVE header with pulsing green status dot */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <span className="relative inline-flex">
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: '#35D6A0', opacity: 0.4, animationDuration: '2s' }}
          />
          <span
            className="relative inline-block w-2 h-2 rounded-full"
            style={{
              backgroundColor: '#35D6A0',
              boxShadow: '0 0 6px 1px rgba(53, 214, 160, 0.6)',
            }}
          />
        </span>
        <span
          className="font-semibold uppercase"
          style={{
            color: '#F0F3FA',
            fontSize: 'clamp(12px, 3.5vw, 14px)',
            letterSpacing: '1.8px',
          }}
        >
          VirgoPlay Live
        </span>
      </div>

      {/* Total page visits — persisted counter for the Public Chat Library */}
      <div className="-mt-5 mb-7 flex flex-col items-center">
        <span
          className="font-medium uppercase"
          style={{
            color: 'rgba(240, 243, 250, 0.55)',
            fontSize: 'clamp(10px, 2.6vw, 11px)',
            letterSpacing: '1.6px',
          }}
        >
          Total Page Visits
        </span>
        <span
          className="font-semibold mt-1"
          style={{
            color: '#35D6A0',
            fontSize: 'clamp(18px, 5vw, 24px)',
            letterSpacing: '0.5px',
          }}
        >
          {pageVisits === null ? '—' : formatVisitCount(pageVisits)}
        </span>
      </div>

      <ParticleSphere cinemaRef={cinemaRef} />

      {/* Cinematic text sequence — drives sphere activity via shared ref */}
      <div className="mt-6 mb-8">
        <CinematicText cinemaRef={cinemaRef} inView={inView} />
      </div>

      <div className="flex items-start justify-center gap-6 sm:gap-12">
        <MetricCounter labelTop="Active" labelBottom="Clients" value={metrics.activeClients} active={inView} />
        <MetricCounter labelTop="Verified" labelBottom="Creators" value={metrics.verifiedCreators} active={inView} />
        <MetricCounter labelTop="Roles" labelBottom="Published" value={metrics.rolesPublished} active={inView} />
      </div>
    </section>
  );
}
