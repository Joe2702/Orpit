import React, { useRef, useState } from 'react';

// A 24-hour dial for bedtime and wake-up.
//
// Two numbers that only mean something together — you don't pick a bedtime and
// then separately pick a wake time, you pick a *night* — so they belong on one
// control where the gap between them is the thing you're actually setting. Two
// time fields make you do that arithmetic in your head.
//
// Midnight sits at the top and the day runs clockwise, matching every phone
// clock app, so the arc reads as the shape of the night at a glance.

const R = 104; // radius of the track the handles ride
const CX = 130;
const CY = 130;
const SNAP = 5; // minutes; finer than this is fiddly on a thumb and never meant

/** Hour (0–24, fractional) → point on the dial. Midnight at the top. */
function point(hour: number, radius = R): { x: number; y: number } {
  const a = (hour / 24) * Math.PI * 2;
  return { x: CX + radius * Math.sin(a), y: CY - radius * Math.cos(a) };
}

/** Inverse: a position relative to the centre → the hour it points at. */
function hourAt(dx: number, dy: number): number {
  // atan2 measured from the top, increasing clockwise.
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += Math.PI * 2;
  return (a / (Math.PI * 2)) * 24;
}

const snap = (hour: number): number => {
  const step = SNAP / 60;
  return ((Math.round(hour / step) * step) % 24 + 24) % 24;
};

export const fmtClock = (hour: number): string => {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export function SleepDial({
  bed,
  wake,
  onChange,
  haptic,
}: {
  /** Fractional hours, 0–24. */
  bed: number;
  wake: number;
  onChange: (bed: number, wake: number) => void;
  haptic?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<'bed' | 'wake' | null>(null);
  const lastSnap = useRef<number>(-1);

  // Hours asleep, always the clockwise gap: a night that crosses midnight is
  // the normal case, not an error to guard against.
  const span = ((wake - bed) % 24 + 24) % 24;

  const from = point(bed);
  const to = point(wake);
  // A sweep over half the dial needs the large-arc flag or the path renders as
  // the short way round — the difference between an 8-hour night and a 16-hour one.
  const largeArc = span > 12 ? 1 : 0;
  const arc = `M ${from.x} ${from.y} A ${R} ${R} 0 ${largeArc} 1 ${to.x} ${to.y}`;

  const update = (e: React.PointerEvent) => {
    if (!drag || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    // The SVG is drawn in a 260-unit box and scaled by CSS, so client pixels
    // have to come back to that box before the geometry means anything.
    const scale = 260 / r.width;
    const x = (e.clientX - r.left) * scale;
    const y = (e.clientY - r.top) * scale;
    const h = snap(hourAt(x - CX, y - CY));

    if (h !== lastSnap.current) {
      lastSnap.current = h;
      haptic?.();
    }
    if (drag === 'bed') {
      // Keep at least a sliver of night: dragging one handle onto the other
      // would collapse the arc to nothing and the path would vanish.
      if (((wake - h) % 24 + 24) % 24 < 0.25) return;
      onChange(h, wake);
    } else {
      if (((h - bed) % 24 + 24) % 24 < 0.25) return;
      onChange(bed, h);
    }
  };

  const start = (which: 'bed' | 'wake') => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    lastSnap.current = -1;
    setDrag(which);
  };

  const end = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDrag(null);
  };

  const ticks = [];
  for (let i = 0; i < 48; i++) {
    const hour = i / 2;
    const major = i % 6 === 0;
    const a = point(hour, R - 20);
    const b = point(hour, R - (major ? 30 : 26));
    ticks.push(
      <line
        key={i}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="var(--text2)"
        strokeWidth={major ? 2 : 1}
        opacity={major ? 0.55 : 0.28}
        strokeLinecap="round"
      />
    );
  }

  const labels = [0, 6, 12, 18].map((h) => {
    const p = point(h, R - 46);
    return (
      <text
        key={h}
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 13, fontWeight: 600, fill: 'var(--text2)' }}
      >
        {h}
      </text>
    );
  });

  const handle = (which: 'bed' | 'wake', hour: number, icon: React.ReactNode) => {
    const p = point(hour);
    return (
      <g
        onPointerDown={start(which)}
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        {/* A generous invisible target: the visible handle is 20px but a thumb
            is not, and missing it and dragging the page instead is maddening. */}
        <circle cx={p.x} cy={p.y} r={26} fill="transparent" />
        <circle
          cx={p.x}
          cy={p.y}
          r={17}
          fill="var(--indigo)"
          stroke="var(--surface)"
          strokeWidth={3}
          style={{ filter: drag === which ? 'brightness(1.15)' : undefined }}
        />
        <g transform={`translate(${p.x - 8}, ${p.y - 8})`} style={{ pointerEvents: 'none' }}>
          {icon}
        </g>
      </g>
    );
  };

  const moon = (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ overflow: 'visible' }}>
      <path d="M14 9.3A5.6 5.6 0 1 1 6.7 2a4.4 4.4 0 0 0 7.3 7.3Z" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinejoin="round" />
    </svg>
  );
  const sun = (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ overflow: 'visible' }}>
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="#fff" strokeWidth={1.7} />
      <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 260 260"
      width="100%"
      style={{ display: 'block', maxWidth: 300, margin: '0 auto', touchAction: 'none', userSelect: 'none' }}
      onPointerMove={update}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={34} />
      <path d={arc} fill="none" stroke="var(--indigo)" strokeWidth={34} strokeLinecap="round" opacity={0.92} />
      {ticks}
      {labels}
      {handle('bed', bed, moon)}
      {handle('wake', wake, sun)}
    </svg>
  );
}
