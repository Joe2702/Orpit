import React from 'react';
import { cssVar } from './format';

let sparkId = 0;

function smooth(pts: number[][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(
      1
    )} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Bars({
  values,
  colorKey,
  w = 132,
  h = 42,
  gap = 5,
}: {
  values: number[];
  colorKey: string;
  w?: number;
  h?: number;
  gap?: number;
}) {
  const col = cssVar(colorKey);
  const max = Math.max.apply(null, values.concat([1]));
  const n = values.length;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {values.map((v, i) => {
        const bh = Math.max(3, (v / max) * (h - 3));
        const x = i * (bw + gap);
        return (
          <rect
            key={i}
            x={x}
            y={h - bh}
            width={bw}
            height={bh}
            rx={Math.min(3.5, bw / 2)}
            style={{ fill: col, opacity: i === n - 1 ? 1 : 0.3 }}
          />
        );
      })}
    </svg>
  );
}

export function Spark({
  values,
  colorKey,
  w = 132,
  h = 42,
  area = true,
  sw = 2.4,
  dot = true,
}: {
  values: number[];
  colorKey: string;
  w?: number;
  h?: number;
  area?: boolean;
  sw?: number;
  dot?: boolean;
}) {
  const col = cssVar(colorKey);
  const max = Math.max.apply(null, values),
    min = Math.min.apply(null, values),
    rng = max - min || 1,
    n = values.length;
  const pts = values.map((v, i) => [(i / Math.max(1, n - 1)) * (w - 6) + 3, h - 5 - ((v - min) / rng) * (h - 12)]);
  const d = smooth(pts);
  const id = 'sp' + sparkId++;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
              <stop offset="0%" stopColor={col} stopOpacity={0.26} />
              <stop offset="100%" stopColor={col} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={d + ` L ${pts[n - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`}
            fill={`url(#${id})`}
            stroke="none"
          />
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke={col}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {dot && <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={3} fill={col} />}
    </svg>
  );
}

export interface Seg {
  value: number;
  color: string;
}

export function Donut({ segs, size = 148, stroke = 20 }: { segs: Seg[]; size?: number; stroke?: number }) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - stroke) / 2,
    c = size / 2,
    circ = 2 * Math.PI * r;
  let off = 0;
  const gap = circ * 0.014;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.55} />
      {segs.map((s, i) => {
        const frac = s.value / total,
          len = Math.max(0.001, frac * circ - gap);
        const el = (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-off}
            strokeLinecap="round"
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
        off += frac * circ;
        return el;
      })}
    </svg>
  );
}

export function Ring({
  pct,
  colorKey,
  size = 56,
  stroke = 7,
}: {
  pct: number;
  colorKey: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2,
    c = size / 2,
    circ = 2 * Math.PI * r,
    len = (circ * pct) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.6} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={cssVar(colorKey)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${len} ${circ - len}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}

export function sleepColor(h: number): string {
  return h < 7 ? 'var(--danger)' : h <= 9 ? 'var(--success)' : 'var(--coral)';
}

export function Candles({
  items,
  w = 300,
  h = 140,
  maxBar = 18,
}: {
  items: { hours: number }[];
  w?: number;
  h?: number;
  maxBar?: number;
}) {
  const maxH = 12,
    n = items.length;
  const slotW = n ? w / n : w,
    bw = Math.max(2.5, Math.min(maxBar, slotW * 0.62));
  const y = (hrs: number) => h - (Math.min(hrs, maxH) / maxH) * (h - 3);
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {[7, 9].map((g, i) => (
        <line
          key={'g' + i}
          x1={0}
          y1={y(g)}
          x2={w}
          y2={y(g)}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {items.map((it, i) => {
        const cx = slotW * i + slotW / 2,
          yt = y(it.hours);
        return (
          <rect
            key={i}
            x={cx - bw / 2}
            y={yt}
            width={bw}
            height={Math.max(2.5, h - yt)}
            rx={Math.min(4, bw / 2)}
            style={{ fill: sleepColor(it.hours) }}
          />
        );
      })}
    </svg>
  );
}

// Heatmap rendered from REAL per-day check-in levels (0-4). grid[col][row].
export function Heat({ grid, colorKey, cell = 13 }: { grid: number[][]; colorKey: string; cell?: number }) {
  const cols = grid.length,
    rows = 7,
    gap = 4.5;
  const ops = [0, 0.28, 0.5, 0.74, 1];
  const rects: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const iv = grid[c][r] || 0;
      const fill =
        iv === 0
          ? 'color-mix(in srgb, var(--text2) 12%, transparent)'
          : `color-mix(in srgb, ${cssVar(colorKey)} ${Math.round(ops[iv] * 100)}%, transparent)`;
      rects.push(
        <rect
          key={c + '-' + r}
          x={c * (cell + gap)}
          y={r * (cell + gap)}
          width={cell}
          height={cell}
          rx={3.5}
          style={{ fill }}
        />
      );
    }
  }
  const w = cols * (cell + gap) - gap,
    h = rows * (cell + gap) - gap;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMinYMid meet"
      style={{ display: 'block' }}
    >
      {rects}
    </svg>
  );
}

// Sleep timeline: Y axis is the 24-hour clock (0 at top → 24 at bottom).
// Each night is a bar spanning bedtime → wake-up; nights that cross midnight
// render as two segments (bottom near 24, top near 0).
export function SleepTimeline({
  items,
  w = 300,
  h = 140,
  maxBar = 18,
}: {
  items: { hours: number; bedH: number | null; wakeH: number | null }[];
  w?: number;
  h?: number;
  maxBar?: number;
}) {
  const n = items.length;
  const slotW = n ? w / n : w;
  const bw = Math.max(2.5, Math.min(maxBar, slotW * 0.62));
  const y = (hod: number) => (hod / 24) * h; // 0:00 at top, 24:00 at bottom
  const ch: React.ReactNode[] = [];
  [6, 12, 18].forEach((g, i) =>
    ch.push(
      <line key={'g' + i} x1={0} y1={y(g)} x2={w} y2={y(g)} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
    )
  );
  items.forEach((it, i) => {
    if (it.bedH == null || it.wakeH == null) return;
    const cx = slotW * i + slotW / 2;
    const col = sleepColor(it.hours);
    const bed = ((it.bedH % 24) + 24) % 24;
    const wake = ((it.wakeH % 24) + 24) % 24;
    const segs: [number, number][] = wake > bed ? [[bed, wake]] : [[bed, 24], [0, wake]];
    segs.forEach(([a, b], si) => {
      const yA = y(a);
      const yB = y(b);
      ch.push(
        <rect key={i + '-' + si} x={cx - bw / 2} y={yA} width={bw} height={Math.max(2, yB - yA)} rx={Math.min(4, bw / 2)} style={{ fill: col }} />
      );
    });
  });
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {ch}
    </svg>
  );
}
