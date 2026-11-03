import React from 'react';

// Deep space behind the language screen, Welcome and the first-run tour. One
// colour only: the accent, as a faint nebula and the glow on a planet's rim.
// Everything else is white light on black.

const seeded = (i: number, n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
// Two layers of stars: many small and far, a few larger and nearer, which
// move more when the scene moves, for depth.
const FAR = Array.from({ length: 70 }, (_, i) => ({ x: seeded(i, 1) * 100, y: seeded(i, 2) * 100, s: 0.8 + seeded(i, 3) * 1.2, d: seeded(i, 4) * 5, dur: 3 + seeded(i, 5) * 4 }));
const NEAR = Array.from({ length: 16 }, (_, i) => ({ x: seeded(i + 99, 1) * 100, y: seeded(i + 99, 2) * 80, s: 1.8 + seeded(i + 99, 3) * 1.6, d: seeded(i + 99, 4) * 4, dur: 2.4 + seeded(i + 99, 5) * 3 }));
const METEORS = [
  { top: '12%', left: '78%', dur: 9, delay: 2 },
  { top: '26%', left: '96%', dur: 13, delay: 7 },
  { top: '6%', left: '52%', dur: 17, delay: 11 },
];

/**
 * `shift` moves the star layers sideways (scene index, a finger's drag), and
 * `horizon` draws the curve of a planet along the bottom, lit at its rim.
 */
export function Space({ shift = 0, drift = 0, horizon = true, horizonTop = '62%', animate = true }: { shift?: number; drift?: number; horizon?: boolean; horizonTop?: string; animate?: boolean }) {
  const ease = 'transform 1.4s cubic-bezier(.2,.8,.2,1)';
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: 'radial-gradient(120% 80% at 50% 0%, #0d0d16 0%, #06060a 60%)' }}>
      {/* The nebula: the accent, very faint, turning slowly. */}
      <div style={{ position: 'absolute', left: `calc(50% + ${drift}px)`, top: '30%', width: '150vw', height: '110vw', maxWidth: 820, maxHeight: 620, transition: 'left 1.4s cubic-bezier(.2,.8,.2,1)' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, color-mix(in srgb, var(--indigo) 30%, transparent), color-mix(in srgb, var(--indigo) 8%, transparent) 55%, transparent)',
            filter: 'blur(10px)',
            animation: animate ? 'nebula 26s ease-in-out infinite' : undefined,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
      <div style={{ position: 'absolute', inset: '-10% -25%', transform: `translateX(${shift * -10}px)`, transition: ease }}>
        {FAR.map((s, k) => (
          <span key={k} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, borderRadius: '50%', background: '#fff', opacity: 0.5, animation: animate ? `twinkle ${s.dur}s ease-in-out ${s.d}s infinite` : undefined }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: '-10% -25%', transform: `translateX(${shift * -26}px)`, transition: ease }}>
        {NEAR.map((s, k) => (
          <span key={k} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,.7)', animation: animate ? `twinkle ${s.dur}s ease-in-out ${s.d}s infinite` : undefined }} />
        ))}
      </div>
      {animate &&
        METEORS.map((m, k) => (
          <span
            key={k}
            style={{
              position: 'absolute',
              top: m.top,
              left: m.left,
              width: 130,
              height: 1.5,
              borderRadius: 2,
              background: 'linear-gradient(90deg, #fff, rgba(255,255,255,0))',
              transformOrigin: 'left center',
              opacity: 0,
              animation: `shoot ${m.dur}s linear ${m.delay}s infinite`,
            }}
          />
        ))}
      {/* A planet below: dark, with a thin lit rim and a glow of atmosphere above it. */}
      {horizon && (
        <div style={{ position: 'absolute', left: '50%', top: horizonTop, width: 1500, height: 1500, marginLeft: -750 }}>
          <div style={{ position: 'absolute', inset: -40, borderRadius: '50%', background: 'radial-gradient(closest-side, transparent 92%, color-mix(in srgb, var(--indigo) 22%, transparent) 97%, transparent)', animation: animate ? 'atmosphere 6s ease-in-out infinite' : undefined }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 50% 0%, #11111b, #07070b 18%)', boxShadow: 'inset 0 1.5px 0 color-mix(in srgb, var(--indigo) 65%, #fff), inset 0 12px 30px -12px color-mix(in srgb, var(--indigo) 40%, transparent)' }} />
        </div>
      )}
    </div>
  );
}
