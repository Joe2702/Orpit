import React, { useState } from 'react';
import { useWidth } from '../ui/kit';
import { isRTL, date, num } from '../i18n';

// Charts for a big screen: real axes and gridlines, one colour (the accent),
// a tooltip on every bar, point and square. Time runs right to left in Arabic,
// the same as on the phone.

/** A round number at or above `v`, for the top of an axis: 1, 2, 2.5, 5 × 10ⁿ. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Axis values from 0 in round steps (1, 2 or 5 × 10ⁿ), so labels read 10k, 20k, 30k. */
export function ticks(max: number, n = 5): number[] {
  // Nothing yet (a new account): still a sensible empty axis, not a 0-to-0 one.
  if (!(max > 0)) max = n;
  const raw = max / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw - 1e-9)!;
  const top = Math.max(step, step * Math.ceil(max / step - 1e-9));
  const out: number[] = [];
  for (let i = 0; i * step <= top + step / 1000; i++) out.push(+(i * step).toPrecision(12));
  return out;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  value: string;
}
function TipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      <span className="faint">{tip.title}</span>
      <b>{tip.value}</b>
    </div>
  );
}

export interface BarDatum {
  /** Under the bar; empty to skip a label. */
  label: string;
  value: number | null;
  /** The bar's own name in the tooltip ("Mon, Nov 3"). */
  title: string;
  /** The current period: drawn solid, the rest softer. */
  now?: boolean;
  /** Hasn't happened yet: an empty slot, not a zero. */
  future?: boolean;
}

export function BarChart({
  data,
  height = 200,
  fmt = (v: number) => num(Math.round(v)),
  tipFmt,
  refLine,
  minTop,
}: {
  data: BarDatum[];
  height?: number;
  fmt?: (v: number) => string;
  tipFmt?: (v: number | null) => string;
  refLine?: { value: number; label: string };
  minTop?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const rtl = isRTL();
  const gutter = 46;
  const bottom = 24;
  const plotW = Math.max(10, w - gutter);
  const plotH = height - bottom - 8;
  const max = Math.max(minTop || 0, refLine?.value || 0, ...data.map((d) => d.value || 0));
  const ys = ticks(max);
  const top = ys[ys.length - 1];
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(34, slot * 0.62));
  const X = (i: number) => {
    const x = gutter + slot * i + (slot - bw) / 2;
    return rtl ? w - x - bw : x;
  };
  const Y = (v: number) => 8 + plotH - (v / top) * plotH;
  const axisX = rtl ? w - gutter + 8 : gutter - 8;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56)));

  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <g className="grid">
            {ys.map((v) => (
              <line key={v} x1={rtl ? 0 : gutter} x2={rtl ? w - gutter : w} y1={Y(v)} y2={Y(v)} strokeDasharray={v === 0 ? undefined : '3 4'} />
            ))}
          </g>
          <g className="axis">
            {ys.map((v) => (
              <text key={v} x={axisX} y={Y(v) + 4} textAnchor={rtl ? 'start' : 'end'}>
                {fmt(v)}
              </text>
            ))}
            {data.map((d, i) =>
              d.label && (i % every === 0 || d.now) ? (
                <text key={i} x={X(i) + bw / 2} y={height - 6} textAnchor="middle" style={d.now ? { fill: 'var(--text)', fontWeight: 600 } : undefined}>
                  {d.label}
                </text>
              ) : null
            )}
          </g>
          {refLine && refLine.value > 0 && (
            <g>
              <line x1={rtl ? 0 : gutter} x2={rtl ? w - gutter : w} y1={Y(refLine.value)} y2={Y(refLine.value)} stroke="var(--text-3)" strokeDasharray="5 4" />
              <text x={rtl ? 4 : w - 4} y={Y(refLine.value) - 5} textAnchor={rtl ? 'start' : 'end'} style={{ fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>
                {refLine.label}
              </text>
            </g>
          )}
          {data.map((d, i) => {
            const v = d.value || 0;
            const h = v > 0 ? Math.max(2, Y(0) - Y(v)) : 0;
            return (
              <g
                key={i}
                onMouseEnter={() => (d.future ? setTip(null) : setTip({ x: X(i) + bw / 2, y: Math.min(Y(v), Y(0) - 4), title: d.title, value: tipFmt ? tipFmt(d.value) : d.value == null ? '—' : fmt(d.value) }))}
              >
                <rect x={X(i) - (slot - bw) / 2} y={8} width={slot} height={plotH} fill="transparent" />
                {d.future ? null : h > 0 ? (
                  <path d={roundTop(X(i), Y(v), bw, h, Math.min(4, bw / 2))} fill={d.now ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 58%, transparent)'} />
                ) : (
                  <circle cx={X(i) + bw / 2} cy={Y(0) - 3} r={1.6} fill="var(--text-3)" />
                )}
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}

/** A bar with rounded top corners, square on the baseline. */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface LinePoint {
  label: string;
  title: string;
  value: number;
}

/** A line with a soft fill under it, and a crosshair that follows the mouse. */
export function LineChart({ data, height = 220, fmt = (v: number) => num(Math.round(v)), zeroBased = false }: { data: LinePoint[]; height?: number; fmt?: (v: number) => string; zeroBased?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rtl = isRTL();
  const gutter = 56;
  const bottom = 24;
  const plotW = Math.max(10, w - gutter - 8);
  const plotH = height - bottom - 10;
  const vals = data.map((d) => d.value);
  let lo = zeroBased ? 0 : Math.min(...vals);
  let hi = Math.max(...vals);
  if (!data.length) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    lo = lo - Math.abs(lo || 1) * 0.1;
    hi = hi + Math.abs(hi || 1) * 0.1;
  }
  const pad = (hi - lo) * 0.12;
  if (!zeroBased || lo < 0) lo -= pad;
  hi += pad;
  const n = 4;
  const ys = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) / n) * i);
  const X = (i: number) => {
    const x = gutter + (data.length <= 1 ? plotW / 2 : (plotW / (data.length - 1)) * i);
    return rtl ? w - x : x;
  };
  const Y = (v: number) => 10 + plotH - ((v - lo) / (hi - lo)) * plotH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d.value).toFixed(1)}`).join('');
  const area = data.length ? `${line}L${X(data.length - 1)},${Y(lo)}L${X(0)},${Y(lo)}Z` : '';
  const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 70)));
  const gid = React.useId().replace(/:/g, '');

  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = 0;
    let bd = Infinity;
    data.forEach((_, i) => {
      const dd = Math.abs(X(i) - x);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="chart" ref={ref} style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="grid">
            {ys.map((v, i) => (
              <line key={i} x1={rtl ? 8 : gutter} x2={rtl ? w - gutter : w - 8} y1={Y(v)} y2={Y(v)} strokeDasharray="3 4" />
            ))}
          </g>
          <g className="axis">
            {ys.map((v, i) => (
              <text key={i} x={rtl ? w - gutter + 8 : gutter - 8} y={Y(v) + 4} textAnchor={rtl ? 'start' : 'end'}>
                {fmt(v)}
              </text>
            ))}
            {data.map((d, i) =>
              i % every === 0 || i === data.length - 1 ? (
                <text key={i} x={X(i)} y={height - 6} textAnchor="middle">
                  {d.label}
                </text>
              ) : null
            )}
          </g>
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && data[hover] && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={10} y2={10 + plotH} stroke="var(--line-2)" />
              <circle cx={X(hover)} cy={Y(data[hover].value)} r={4.5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hover != null && data[hover] && <TipBox tip={{ x: X(hover), y: Y(data[hover].value), title: data[hover].title, value: fmt(data[hover].value) }} />}
    </div>
  );
}

/**
 * When each night started and ended: a bar from bedtime to waking, on a clock
 * running from early evening to midday. Steady bars mean a steady schedule.
 */
export function SleepSchedule({ nights, height = 220, clock }: { nights: { day: number; bedH: number | null; wakeH: number | null; hours: number | null }[]; height?: number; clock: (h: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const rtl = isRTL();
  const gutter = 52;
  const bottom = 24;
  const plotW = Math.max(10, w - gutter);
  const plotH = height - bottom - 8;
  // Hours after 18:00, so a 23:30 → 07:00 night is one unbroken bar.
  const from = 18;
  const span = 20;
  const rel = (h: number) => ((h - from + 24) % 24);
  const Y = (h: number) => 8 + (rel(h) / span) * plotH;
  const slot = plotW / Math.max(1, nights.length);
  const bw = Math.max(4, Math.min(22, slot * 0.5));
  const X = (i: number) => {
    const x = gutter + slot * i + (slot - bw) / 2;
    return rtl ? w - x - bw : x;
  };
  const marks = [20, 22, 0, 2, 4, 6, 8, 10, 12];
  const every = Math.ceil(nights.length / Math.max(1, Math.floor(plotW / 48)));
  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <g className="grid">
            {marks.map((h) => (
              <line key={h} x1={rtl ? 0 : gutter} x2={rtl ? w - gutter : w} y1={Y(h)} y2={Y(h)} strokeDasharray="3 4" />
            ))}
          </g>
          <g className="axis">
            {marks.map((h) => (
              <text key={h} x={rtl ? w - gutter + 8 : gutter - 8} y={Y(h) + 4} textAnchor={rtl ? 'start' : 'end'}>
                {clock(h)}
              </text>
            ))}
            {nights.map((n, i) =>
              i % every === 0 || i === nights.length - 1 ? (
                <text key={i} x={X(i) + bw / 2} y={height - 6} textAnchor="middle">
                  {date(n.day, { day: 'numeric' })}
                </text>
              ) : null
            )}
          </g>
          {nights.map((n, i) => {
            if (n.bedH == null || n.wakeH == null) return <circle key={i} cx={X(i) + bw / 2} cy={8 + plotH / 2} r={1.6} fill="var(--text-3)" />;
            const y1 = Y(n.bedH);
            let y2 = Y(n.wakeH);
            if (y2 <= y1) y2 = y1 + 4;
            return (
              <rect
                key={i}
                x={X(i)}
                y={y1}
                width={bw}
                height={y2 - y1}
                rx={Math.min(5, bw / 2)}
                fill={i === nights.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 58%, transparent)'}
                onMouseEnter={() => setTip({ x: X(i) + bw / 2, y: y1, title: date(n.day, { weekday: 'short', month: 'short', day: 'numeric' }), value: `${clock(n.bedH!)} → ${clock(n.wakeH!)}` })}
              />
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}

export interface HeatCell {
  day: number;
  /** 0..1, or null when nothing was planned. */
  share: number | null;
  future: boolean;
}

/** A year of days as squares, a column per week: the darker, the more was done. */
export function Heatmap({ weeks, title }: { weeks: HeatCell[][]; title: (c: HeatCell) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const left = 30;
  const gap = 3;
  const cols = weeks.length;
  const cell = Math.max(6, Math.min(22, (w - left - gap * (cols - 1)) / Math.max(1, cols)));
  const height = 18 + 7 * (cell + gap);
  const rtl = isRTL();
  const X = (i: number) => {
    const x = left + i * (cell + gap);
    return rtl ? w - x - cell : x;
  };
  const tone = (c: HeatCell) =>
    c.future ? 'transparent' : c.share === null ? 'var(--panel-2)' : c.share === 0 ? 'color-mix(in srgb, var(--accent) 8%, var(--panel-2))' : `color-mix(in srgb, var(--accent) ${Math.round(28 + c.share * 72)}%, var(--panel-2))`;
  const months: { i: number; label: string }[] = [];
  weeks.forEach((wk, i) => {
    const d = new Date(wk[0].day);
    if (i === 0 || new Date(weeks[i - 1][0].day).getMonth() !== d.getMonth()) months.push({ i, label: date(d, { month: 'short' }) });
  });
  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <g className="axis">
            {months.map((m) => (
              <text key={m.i} x={X(m.i) + (rtl ? cell : 0)} y={11} textAnchor={rtl ? 'end' : 'start'}>
                {m.label}
              </text>
            ))}
            {[1, 3, 5].map((r) => (
              <text key={r} x={rtl ? w : 0} y={18 + r * (cell + gap) + cell - 1} textAnchor={rtl ? 'end' : 'start'} style={{ fontSize: 11 }}>
                {date(new Date(2026, 0, 4 + r), { weekday: 'short' })}
              </text>
            ))}
          </g>
          {weeks.map((wk, i) =>
            wk.map((c, r) => (
              <rect
                key={c.day}
                x={X(i)}
                y={18 + r * (cell + gap)}
                width={cell}
                height={cell}
                rx={Math.min(3, cell / 4)}
                fill={tone(c)}
                onMouseEnter={() => !c.future && setTip({ x: X(i) + cell / 2, y: 18 + r * (cell + gap), title: date(c.day, { weekday: 'short', month: 'short', day: 'numeric' }), value: title(c) })}
              />
            ))
          )}
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}

/** Ranked amounts, largest first: a name, a bar, the figure. */
export function RankBars({ rows, fmt }: { rows: { key: string; label: React.ReactNode; value: number; sub?: string; onClick?: () => void }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {rows.map((r) => (
        <div key={r.key} className={r.onClick ? 'hover-row' : undefined} onClick={r.onClick} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 180px) 1fr 96px', alignItems: 'center', gap: 16, padding: '8px 8px', margin: '0 -8px', borderRadius: 7, cursor: r.onClick ? 'pointer' : 'default' }}>
          <span className="truncate" style={{ fontWeight: 500 }}>
            {r.label}
          </span>
          <span className="bar" style={{ height: 8 }}>
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="num" style={{ textAlign: 'end', fontWeight: 600 }}>
            {fmt(r.value)}
            {r.sub && <span className="faint" style={{ display: 'block', fontSize: 11, fontWeight: 500 }}>{r.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A tiny line for a stat card: the shape of the trend, no axes. */
export function Spark({ values, height = 34, width = 110 }: { values: number[]; height?: number; width?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rtl = isRTL();
  const X = (i: number) => {
    const x = (width / (values.length - 1)) * i;
    return rtl ? width - x : x;
  };
  const Y = (v: number) => 3 + (height - 6) * (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} aria-hidden style={{ flex: 'none', overflow: 'visible' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r={2.8} fill="var(--accent)" />
    </svg>
  );
}
