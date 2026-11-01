import React from 'react';

// Orbit's mark, the same drawing as the launcher icon (tools/make-icons.py):
// a faint full orbit, a trail sweeping most of the way round it, and a warm
// sun at its head. Drawn with CSS rather than SVG because a fade that follows
// a curve is one conic gradient here and impossible to do smoothly in SVG.
//
// `tone="light"` is for the dark and indigo screens (loading, welcome, lock,
// error); `tone="accent"` draws it in the accent colour for light surfaces.

// The icon's geometry, in its own units.
const R = 21;
const W = 6.6;
const DOT = 5.8;
const HEAD = 32; // degrees clockwise from the top
const BOX = 2 * (R + DOT);

export function OrbitMark({ size = 52, spin = false, tone = 'light', style }: { size?: number; spin?: boolean; tone?: 'light' | 'accent'; style?: React.CSSProperties }) {
  const k = size / BOX;
  const r = R * k;
  const w = W * k;
  const dot = DOT * k;
  const c = size / 2;
  const ink = tone === 'light' ? '#f0f0f3' : 'var(--indigo)';
  const sun = tone === 'light' ? '#ffd28f' : 'var(--indigo)';
  const a = (p: number) => `color-mix(in srgb, ${ink} ${p}%, transparent)`;
  const ringBox: React.CSSProperties = {
    position: 'absolute',
    left: c - r - w / 2,
    top: c - r - w / 2,
    width: 2 * r + w,
    height: 2 * r + w,
    borderRadius: '50%',
  };
  // A ring w wide, cut out of whatever fills the box.
  const ring = `radial-gradient(farthest-side, transparent calc(100% - ${w}px - 0.5px), #000 calc(100% - ${w}px), #000 calc(100% - 0.5px), transparent 100%)`;
  const masked: React.CSSProperties = { WebkitMaskImage: ring, maskImage: ring };
  const sx = c + r * Math.sin((HEAD * Math.PI) / 180);
  const sy = c - r * Math.cos((HEAD * Math.PI) / 180);

  return (
    <div aria-hidden style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }}>
      <div style={{ ...ringBox, ...masked, background: a(tone === 'light' ? 17 : 22) }} />
      <div style={{ position: 'absolute', inset: 0, animation: spin ? 'orbitSpin 2.4s linear infinite' : undefined }}>
        <div
          style={{
            ...ringBox,
            ...masked,
            background: `conic-gradient(from ${HEAD + 60}deg, transparent 0deg, ${a(22)} 110deg, ${a(55)} 210deg, ${ink} 300deg, transparent 300deg)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: sx - dot,
            top: sy - dot,
            width: dot * 2,
            height: dot * 2,
            borderRadius: '50%',
            background: sun,
            boxShadow: tone === 'light' ? `0 0 ${dot * 1.8}px ${dot * 0.5}px rgba(255, 190, 110, .45)` : 'none',
          }}
        />
      </div>
    </div>
  );
}
