import React from 'react';
import { cssVar, fmtClock } from './format';
import type { Bucket } from './period';

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

// Short, healthy and long sleep need three colours that read as three things.
// Long was coral beside short's red — the legend showed two near-identical
// reds for opposite problems.
export function sleepColor(h: number): string {
  return h < 7 ? 'var(--amber)' : h <= 9 ? 'var(--blue)' : 'var(--purple)';
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

// ---------------------------------------------------------------------------
// Time charts
//
// One chart for every "how much, when" question in the app. It is laid out in
// HTML rather than a stretched SVG, so labels are real text at a real size and
// each bar is a real tap target. It always draws the whole period: days or
// months still to come are faint stubs on the baseline, a past bucket with
// nothing in it is a short muted mark, and the bucket holding today is the one
// at full strength. Tapping a bar shows its date and value in a bubble above.
// ---------------------------------------------------------------------------

/** A round number at or above `v`, so the axis reads 60 / 120, not 47 / 94. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function useSelection(n: number) {
  const [sel, setSel] = React.useState<number | null>(null);
  React.useEffect(() => setSel(null), [n]);
  return [sel, setSel] as const;
}

function Bubble({ idx, n, title, value, top }: { idx: number; n: number; title: string; value: string; top: number }) {
  const x = ((idx + 0.5) / n) * 100;
  // Anchor to the nearer edge near the ends, so the bubble never leaves the card.
  const anchor = x < 22 ? 'left' : x > 78 ? 'right' : 'center';
  const pos: React.CSSProperties =
    anchor === 'left'
      ? { left: `max(0px, calc(${x}% - 14px))` }
      : anchor === 'right'
      ? { right: `max(0px, calc(${100 - x}% - 14px))` }
      : { left: `${x}%`, transform: 'translateX(-50%)' };
  return (
    <div
      style={{
        position: 'absolute',
        top,
        ...pos,
        zIndex: 2,
        pointerEvents: 'none',
        background: 'var(--text)',
        color: 'var(--bg)',
        borderRadius: 10,
        padding: '6px 10px',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-lg)',
        animation: 'fadeIn .12s ease',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.01em' }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{title}</div>
    </div>
  );
}

function XAxis({ buckets }: { buckets: Bucket[] }) {
  const n = buckets.length;
  return (
    <div style={{ position: 'relative', height: 16, marginTop: 7 }}>
      {buckets.map((b, i) =>
        b.label ? (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${((i + 0.5) / n) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 11,
              fontWeight: b.current ? 650 : 500,
              color: b.current ? 'var(--text)' : 'var(--text3)',
              whiteSpace: 'nowrap',
            }}
          >
            {b.label}
          </span>
        ) : null
      )}
    </div>
  );
}

export function BarChart({
  buckets,
  values,
  color,
  height = 132,
  format,
  max: maxProp,
  band,
  interactive = true,
  axis = true,
  grid = true,
}: {
  buckets: Bucket[];
  values: (number | null)[];
  color: string;
  height?: number;
  /** Formats a value for the bubble and the axis. */
  format: (v: number) => string;
  max?: number;
  /** A shaded target range, e.g. 7–9 hours of sleep. */
  band?: [number, number];
  interactive?: boolean;
  axis?: boolean;
  grid?: boolean;
}) {
  const n = buckets.length;
  const [sel, setSel] = useSelection(n);
  const peak = Math.max(0, ...values.map((v) => v ?? 0));
  const max = maxProp ?? niceMax(peak);
  const gap = n <= 7 ? 10 : n <= 12 ? 7 : n <= 16 ? 5 : 2.5;
  const col = cssVar(color);
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const hasData = peak > 0;

  return (
    <div style={{ position: 'relative', userSelect: 'none' }} onClick={interactive ? (e) => e.stopPropagation() : undefined}>
      <div style={{ position: 'relative', height }}>
        {grid &&
          [1, 0.5].map((f) => (
            <div key={f} style={{ position: 'absolute', left: 0, right: 0, bottom: `${f * 100}%`, borderTop: '1px dashed var(--hairline)' }}>
              {hasData && (
                <span style={{ position: 'absolute', right: 0, top: -15, fontSize: 10.5, color: 'var(--text3)', background: 'var(--surface)', paddingLeft: 4 }}>
                  {format(max * f)}
                </span>
              )}
            </div>
          ))}
        {band && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${pct(band[0])}%`,
              height: `${pct(band[1]) - pct(band[0])}%`,
              background: `color-mix(in srgb, ${col} 8%, transparent)`,
              borderRadius: 4,
            }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap }}>
          {buckets.map((b, i) => {
            const v = values[i];
            const dim = sel != null && sel !== i;
            const future = b.future || v == null;
            const h = future ? 0 : pct(v!);
            return (
              <div
                key={i}
                onClick={interactive && !b.future && v != null ? () => setSel(sel === i ? null : i) : undefined}
                style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: interactive && !future ? 'pointer' : 'default' }}
                aria-label={`${b.name}: ${future ? 'not yet' : format(v!)}`}
              >
                {b.future ? (
                  <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'var(--hairline)' }} />
                ) : v == null || v <= 0 ? (
                  <div style={{ width: '100%', height: 3, borderRadius: 2, background: `color-mix(in srgb, ${col} 22%, transparent)` }} />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: `max(4px, ${h}%)`,
                      borderRadius: n > 16 ? 3 : 6,
                      background: b.current || sel === i ? col : `color-mix(in srgb, ${col} 62%, transparent)`,
                      opacity: dim ? 0.35 : 1,
                      transition: 'opacity .15s, height .35s cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {sel != null && values[sel] != null && (
          <Bubble idx={sel} n={n} title={buckets[sel].name} value={format(values[sel]!)} top={Math.max(-8, (1 - pct(values[sel]!) / 100) * height - 52)} />
        )}
      </div>
      {axis && <XAxis buckets={buckets} />}
    </div>
  );
}

/**
 * Bedtime to wake-up, one bar per day of the period, on a clock axis fitted to
 * the nights shown. The old version spread a full 24 hours from 6 PM to 6 PM,
 * leaving the actual nights in a narrow strip, and placed bars by index, so
 * three nights logged in a month looked like three nights in a row.
 */
export function SleepClock({
  buckets,
  slots,
  height = 150,
}: {
  buckets: Bucket[];
  slots: ({ hours: number; bedH: number | null; wakeH: number | null } | null)[];
  height?: number;
}) {
  const n = buckets.length;
  const [sel, setSel] = useSelection(n);
  // Hours since 18:00, so a night is one continuous span.
  const sh = (hod: number) => (((hod - 18) % 24) + 24) % 24;
  const nights = slots
    .map((s, i) => (s && s.bedH != null && s.wakeH != null ? { i, a: sh(s.bedH), b: sh(s.wakeH) < sh(s.bedH) ? sh(s.wakeH) + 24 : sh(s.wakeH), hours: s.hours } : null))
    .filter(Boolean) as { i: number; a: number; b: number; hours: number }[];
  let lo = nights.length ? Math.min(...nights.map((x) => x.a)) : 4; // 10 PM
  let hi = nights.length ? Math.max(...nights.map((x) => x.b)) : 14; // 8 AM
  lo = Math.max(0, Math.floor((lo - 0.5) / 2) * 2);
  hi = Math.min(30, Math.ceil((hi + 0.5) / 2) * 2);
  if (hi - lo < 8) hi = lo + 8;
  const y = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const step = hi - lo > 12 ? 4 : 2;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  const label = (t: number) => {
    const hod = (t + 18) % 24;
    const h12 = hod % 12 === 0 ? 12 : hod % 12;
    return `${h12} ${hod < 12 ? 'AM' : 'PM'}`;
  };
  const gap = n <= 7 ? 12 : 2.5;
  const selNight = sel != null ? nights.find((x) => x.i === sel) : null;

  return (
    <div style={{ display: 'flex', gap: 8, userSelect: 'none' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: 'relative', height }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${y(t)}%`, borderTop: '1px dashed var(--hairline)' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', gap }}>
            {buckets.map((b, i) => {
              const nt = nights.find((x) => x.i === i);
              const c = nt ? sleepColor(nt.hours) : 'transparent';
              return (
                <div
                  key={i}
                  onClick={nt ? () => setSel(sel === i ? null : i) : undefined}
                  style={{ flex: 1, minWidth: 0, position: 'relative', cursor: nt ? 'pointer' : 'default' }}
                  aria-label={`${b.name}: ${nt ? `${nt.hours.toFixed(1)} hours` : b.future ? 'not yet' : 'no sleep logged'}`}
                >
                  {nt ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${y(nt.a)}%`,
                        height: `${y(nt.b) - y(nt.a)}%`,
                        borderRadius: n > 16 ? 3 : 7,
                        background: c,
                        opacity: sel != null && sel !== i ? 0.35 : b.current || sel === i ? 1 : 0.85,
                        transition: 'opacity .15s',
                      }}
                    />
                  ) : (
                    !b.future && <div style={{ position: 'absolute', left: '50%', bottom: 0, width: 3, height: 3, marginLeft: -1.5, borderRadius: 2, background: 'var(--hairline)' }} />
                  )}
                </div>
              );
            })}
          </div>
          {selNight && slots[selNight.i] && (
            <Bubble
              idx={selNight.i}
              n={n}
              value={`${fmtClock(slots[selNight.i]!.bedH)} → ${fmtClock(slots[selNight.i]!.wakeH)}`}
              title={`${buckets[selNight.i].name} · ${Math.floor(selNight.hours)}h ${String(Math.round((selNight.hours % 1) * 60)).padStart(2, '0')}m`}
              top={Math.max(-8, (y(selNight.a) / 100) * height - 54)}
            />
          )}
        </div>
        <XAxis buckets={buckets} />
      </div>
      <div style={{ position: 'relative', width: 40, height, flex: 'none' }}>
        {ticks.map((t) => (
          <span key={t} style={{ position: 'absolute', right: 0, top: `calc(${y(t)}% - 7px)`, fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
            {label(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Legend dots under a chart. */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 14 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
