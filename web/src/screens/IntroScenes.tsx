// The visuals of the first-run tour, one per scene. Each is a small, live
// mock of the real thing, built from the app's own shapes rather than
// screenshots, so it reads in either language and either direction. Most play
// a short demonstration on their own and then let you try it yourself.

import React, { useEffect, useRef, useState } from 'react';
import { Glyph, type GlyphName } from '../lib/appIcons';
import { RollingText, reducedMotion } from '../Motion';
import { money0 } from '../lib/format';
import { isRTL, t, tk } from '../i18n';

// One colour: the accent (which follows the person's choice in Profile), in a
// few strengths, and white. The tour is space, not a paint box.
const A = 'var(--indigo)';
/** The accent mixed toward white (or another colour) by `pct` percent of accent. */
const tone = (pct: number, base = '#fff') => `color-mix(in srgb, var(--indigo) ${pct}%, ${base})`;
const glow = (pct: number) => `color-mix(in srgb, var(--indigo) ${pct}%, transparent)`;
const COLORS = { indigo: A, coral: A, teal: A, blue: A, emerald: A, amber: A, red: '#fff' };

/**
 * Steps of a little demonstration: step k begins `at[k-1]` ms after it starts,
 * and the whole thing starts over `rest` ms after the last step, until
 * `stop` (someone started using it themselves). With less motion asked for,
 * it shows the last step and stays there.
 */
function useSteps(at: number[], rest = 1800, stop = false): number {
  const still = reducedMotion();
  const [k, setK] = useState(still ? at.length : 0);
  useEffect(() => {
    if (still || stop) return;
    let timers: number[] = [];
    const run = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setK(0);
      at.forEach((ms, i) => timers.push(window.setTimeout(() => setK(i + 1), ms)));
      timers.push(window.setTimeout(run, at[at.length - 1] + rest));
    };
    run();
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);
  return k;
}

/** A fingertip, for showing where to tap. */
function Finger({ x, y, on, pressing }: { x: number | string; y: number | string; on: boolean; pressing?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 34,
        height: 34,
        marginLeft: -17,
        marginTop: -17,
        borderRadius: '50%',
        background: 'rgba(255,255,255,.88)',
        boxShadow: '0 6px 18px rgba(0,0,0,.45), inset 0 -3px 6px rgba(0,0,0,.12)',
        opacity: on ? 1 : 0,
        transform: `scale(${on ? (pressing ? 0.78 : 1) : 0.6})`,
        transition: 'left .6s cubic-bezier(.4,0,.2,1), top .6s cubic-bezier(.4,0,.2,1), opacity .3s, transform .18s',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {pressing && <span style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(255,255,255,.8)', animation: 'ripple .6s ease-out both' }} />}
    </div>
  );
}

/** A small burst of light: a moment worth marking. */
export function Burst({ color = COLORS.indigo, count = 14, size = 1 }: { color?: string; count?: number; size?: number }) {
  return (
    <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, k) => {
        const a = (k / count) * Math.PI * 2;
        const d = (56 + (k % 3) * 18) * size;
        return (
          <span
            key={k}
            style={
              {
                position: 'absolute',
                width: k % 2 ? 4 : 6,
                height: k % 2 ? 4 : 6,
                marginLeft: -3,
                marginTop: -3,
                borderRadius: '50%',
                background: k % 3 ? '#fff' : color,
                ['--bx']: `${Math.cos(a) * d}px`,
                ['--by']: `${Math.sin(a) * d}px`,
                animation: `storyBurst 1.1s cubic-bezier(.1,.8,.3,1) ${(k % 4) * 0.03}s both`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

const Check = ({ on, color = COLORS.indigo, size = 26 }: { on: boolean; color?: string; size?: number }) => (
  <span
    style={{
      position: 'relative',
      width: size,
      height: size,
      flex: 'none',
      borderRadius: '50%',
      border: `1.8px solid ${on ? color : 'rgba(255,255,255,.35)'}`,
      background: on ? color : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .25s, border-color .25s, transform .35s cubic-bezier(.3,1.6,.5,1)',
      transform: on ? 'scale(1.08)' : 'scale(1)',
    }}
  >
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: '#0c0c0f', strokeWidth: 2.3, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" style={{ strokeDasharray: 12, strokeDashoffset: on ? 0 : 12, transition: 'stroke-dashoffset .35s ease .1s' }} />
    </svg>
    {on && <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: `2px solid ${color}`, animation: 'ripple .7s ease-out both' }} />}
  </span>
);

// ---------------------------------------------------------------------------
// 1. Hello: the four parts of a life, in orbit around you

const PLANETS: { icon: GlyphName; color: string; orbit: 0 | 1; phase: number }[] = [
  { icon: 'check', color: A, orbit: 0, phase: 0 },
  { icon: 'dumbbell', color: tone(55), orbit: 0, phase: 0.5 },
  { icon: 'moon', color: tone(75), orbit: 1, phase: 0.25 },
  { icon: 'cash', color: tone(35), orbit: 1, phase: 0.75 },
];
// The inner orbit turns the other way, so planets on the two never travel
// together for long.
const ORBITS = [
  { r: 134, tilt: -12, squash: 0.34, dur: 16, rev: false },
  { r: 88, tilt: 58, squash: 0.36, dur: 11, rev: true },
];

export function HelloVisual() {
  return (
    <div style={{ position: 'relative', width: 300, height: 260 }} aria-hidden>
      {ORBITS.map((o, i) => (
        <svg key={i} width="300" height="260" viewBox="-150 -130 300 260" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <ellipse
            cx="0"
            cy="0"
            rx={o.r}
            ry={o.r * o.squash}
            transform={`rotate(${o.tilt})`}
            fill="none"
            stroke="rgba(255,255,255,.16)"
            strokeWidth="1.2"
            strokeDasharray="900"
            style={{ ['--len' as string]: 900, animation: `drawLine 1.6s cubic-bezier(.65,0,.35,1) ${0.2 + i * 0.2}s both` } as React.CSSProperties}
          />
        </svg>
      ))}
      {/* The sun: you. */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, margin: '-32px 0 0 -32px', animation: 'popIn .9s cubic-bezier(.3,1.4,.5,1) both' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `radial-gradient(circle at 38% 32%, #fff, #f1f2ff 32%, ${tone(55)} 70%, ${A})`, animation: 'sunPulse 4s ease-in-out infinite' }} />
      </div>
      {/* Planets ride a circle squashed into an ellipse; each layer undoes the
          one before, so they stay round and upright the whole way round. */}
      {PLANETS.map((p, i) => {
        const o = ORBITS[p.orbit];
        const delay = `-${p.phase * o.dur}s`;
        return (
          <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transform: `rotate(${o.tilt}deg) scaleY(${o.squash})` }}>
            <div style={{ position: 'absolute', animation: `${o.rev ? 'spinBack' : 'spin'} ${o.dur}s linear ${delay} infinite` }}>
              <div style={{ position: 'absolute', transform: `translateX(${o.r}px)` }}>
                <div style={{ animation: `${o.rev ? 'spin' : 'spinBack'} ${o.dur}s linear ${delay} infinite` }}>
                  <div style={{ transform: `scaleY(${1 / o.squash}) rotate(${-o.tilt}deg)` }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        marginLeft: -19,
                        marginTop: -19,
                        borderRadius: '50%',
                        background: `radial-gradient(circle at 35% 30%, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))`,
                        boxShadow: `0 0 18px ${glow(55)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: `popIn .7s cubic-bezier(.3,1.5,.5,1) ${0.9 + i * 0.15}s both`,
                      }}
                    >
                      <Glyph name={p.icon} size={18} color="#0c0c0f" sw={2.2} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. + logs anything

// The tab bar's own icons: Home, Analytics, Profile.
const TAB_PATHS = [
  <path key="h" d="M4 11l8-7 8 7M6 9.5V19h4.5v-5h3v5H18V9.5" />,
  <path key="a" d="M4 20V11M10 20V5M16 20v-6M4 20h16" />,
  <g key="p">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
  </g>,
];

const MINI_W = 232;
const MINI_H = 330;

function MiniPhone({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        width: MINI_W,
        height: MINI_H,
        borderRadius: 34,
        background: 'linear-gradient(180deg, #17171c, #101014)',
        border: '1.5px solid rgba(255,255,255,.12)',
        boxShadow: '0 30px 60px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const Row = ({ color, title, sub, style }: { color: string; title: string; sub?: string; style?: React.CSSProperties }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--card-line)', ...style }}>
    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flex: 'none', boxShadow: color === A ? `0 0 10px ${glow(70)}` : 'none' }} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

export function PlusVisual() {
  // 1 finger shows · 2 finger at + · 3 tap, sheet up · 4 finger at Workout · 5 tap · 6 sheet down, new entry
  const k = useSteps([500, 1100, 1700, 2500, 3100, 3500], 2600);
  const rtl = isRTL();
  const plusX = rtl ? 34 : MINI_W - 34;
  const sheetUp = k >= 3 && k < 6;
  const items: { icon: GlyphName; color: string; label: string }[] = [
    { icon: 'dumbbell', color: COLORS.coral, label: t('Workout') },
    { icon: 'moon', color: COLORS.blue, label: t('Sleep') },
    { icon: 'cash', color: COLORS.emerald, label: t('Money') },
    { icon: 'check', color: COLORS.amber, label: t('Task') },
    { icon: 'sprout', color: COLORS.teal, label: t('Habit') },
  ];
  const fx = k >= 4 ? MINI_W / 2 : plusX;
  const fy = k >= 4 ? 154 : MINI_H - 34;
  return (
    <MiniPhone>
      <div style={{ padding: '22px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="display" style={{ fontSize: 22, color: 'var(--ink)', marginBottom: 4 }}>{t('Today')}</div>
        {k >= 6 && <Row color={COLORS.coral} title={t('Morning run')} sub={t('32 min · just now')} style={{ animation: 'popIn .55s cubic-bezier(.3,1.4,.5,1) both', borderColor: glow(45) }} />}
        <Row color="rgba(255,255,255,.45)" title={t('Read 20 pages')} sub={t('In bed, before my phone')} />
        <Row color="rgba(255,255,255,.45)" title={t('Drink water')} sub={t('5 of 8 glasses')} />
      </div>
      {/* The bar: tabs in their capsule, + in its own bubble. */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 44, display: 'flex', gap: 8, direction: rtl ? 'rtl' : 'ltr' }}>
        <div style={{ flex: 1, borderRadius: 22, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {TAB_PATHS.map((d, i) => (
            <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden style={{ fill: 'none', stroke: i === 0 ? COLORS.indigo : 'rgba(255,255,255,.7)', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              {d}
            </svg>
          ))}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: k === 3 ? 'scale(.88)' : 'scale(1)', transition: 'transform .2s' }}>
          <Glyph name="plus" size={18} color="#fff" sw={2.4} />
        </div>
      </div>
      {/* The sheet that + opens. */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', opacity: sheetUp ? 1 : 0, transition: 'opacity .3s', pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: 6,
          borderRadius: 26,
          padding: '10px 12px 12px',
          background: 'rgba(40,40,48,.92)',
          border: '1px solid rgba(255,255,255,.12)',
          transform: sheetUp ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform .45s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ width: 30, height: 3, borderRadius: 9, background: 'rgba(255,255,255,.25)', margin: '0 auto 8px' }} />
        <div className="display" style={{ fontSize: 17, color: 'var(--ink)', margin: '0 2px 8px' }}>{t('Log something')}</div>
        {items.map((it, i) => (
          <div
            key={it.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 8px',
              borderRadius: 12,
              background: i === 0 && k === 5 ? 'rgba(255,255,255,.12)' : 'transparent',
              transition: 'background .2s',
              opacity: sheetUp ? 1 : 0,
              transform: sheetUp ? 'none' : 'translateY(8px)',
              transitionProperty: 'opacity, transform, background',
              transitionDuration: '.35s',
              transitionDelay: sheetUp ? `${0.08 + i * 0.05}s` : '0s',
            }}
          >
            <span style={{ width: 24, height: 24, borderRadius: 8, background: glow(22), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Glyph name={it.icon} size={13} color={tone(70)} sw={2.3} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{it.label}</span>
          </div>
        ))}
      </div>
      <Finger x={fx} y={fy} on={k >= 1 && k < 6} pressing={k === 3 || k === 5} />
    </MiniPhone>
  );
}

// ---------------------------------------------------------------------------
// 3. Habits: tap one when it's done (try it)

export function HabitsVisual() {
  const [done, setDone] = useState<boolean[]>([false, false, false]);
  const [touched, setTouched] = useState(false);
  const [burst, setBurst] = useState(0);
  const streaks = [6, 12, 3];
  const habits = [
    { name: t('Read 20 pages'), cue: t('In bed, before my phone'), color: COLORS.indigo },
    { name: t('Morning stretch'), cue: t('Right after I wake up'), color: COLORS.teal },
    { name: t('Drink water'), cue: t('With every meal'), color: COLORS.blue },
  ];
  // Unless someone gets there first, show the first one being ticked.
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setTimeout(() => !touched && setDone((d) => [true, d[1], d[2]]), 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const all = done.every(Boolean);
  useEffect(() => {
    if (all) setBurst((b) => b + 1);
  }, [all]);
  const toggle = (i: number) => {
    setTouched(true);
    navigator.vibrate?.(12);
    setDone((d) => d.map((v, j) => (j === i ? !v : v)));
  };
  return (
    <div data-interactive style={{ width: 300, position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 24,
          background: 'var(--card)',
          border: `1px solid ${all ? glow(60) : 'var(--card-line)'}`,
          boxShadow: all ? `0 0 40px -6px ${glow(55)}` : '0 20px 40px -24px rgba(0,0,0,.6)',
          padding: '6px 0',
          transition: 'border-color .4s, box-shadow .6s',
        }}
      >
        {habits.map((h, i) => (
          <div
            key={h.name}
            role="checkbox"
            aria-checked={done[i]}
            aria-label={h.name}
            tabIndex={0}
            onClick={() => toggle(i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(i))}
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', borderTop: i ? '1px solid rgba(255,255,255,.07)' : 'none', cursor: 'pointer', animation: `rise .5s cubic-bezier(.2,.8,.2,1) ${0.15 + i * 0.08}s both` }}
          >
            <Check on={done[i]} color={h.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: done[i] ? 'var(--ink2)' : 'var(--ink)', transition: 'color .3s' }}>{h.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{h.cue}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: done[i] ? 'var(--ink)' : 'var(--ink3)', transition: 'color .3s', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              <Glyph name="flame" size={14} color={done[i] ? tone(60) : 'rgba(255,255,255,.35)'} sw={2} />
              <span key={String(done[i])}>
                <RollingText text={String(streaks[i] + (done[i] ? 1 : 0))} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
        {all ? (
          <div style={{ position: 'relative', fontSize: 13.5, fontWeight: 700, color: tone(45), padding: '7px 14px', borderRadius: 999, background: glow(18), animation: 'popIn .6s cubic-bezier(.3,1.5,.5,1) both' }}>
            {t('Day complete')}
            <Burst key={burst} />
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', animation: 'hintPulse 1.8s ease-in-out infinite' }}>{touched ? t('Now the rest') : t('Tap one to try it')}</div>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// 4. Put what matters first: drag a card by its handle (try it)

const CARD_H = 64;
const GAP = 10;
const STEP = CARD_H + GAP;

function Grip() {
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden style={{ fill: 'rgba(255,255,255,.55)' }}>
      {[3, 9].map((x) => [3, 9, 15].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
}

export function DragVisual() {
  const cards = [
    { id: 'habits', title: t('Today’s habits'), sub: t('2 of 3 done'), color: COLORS.indigo, icon: 'sprout' as GlyphName },
    { id: 'sleep', title: t('Sleep'), sub: t('7h 30m last night'), color: COLORS.blue, icon: 'moon' as GlyphName },
    { id: 'money', title: t('Spending'), sub: t('This week'), color: COLORS.emerald, icon: 'cash' as GlyphName },
  ];
  const [order, setOrder] = useState(cards.map((c) => c.id));
  const [lifted, setLifted] = useState<string | null>(null);
  const [dy, setDy] = useState(0);
  const [touched, setTouched] = useState(false);
  const [moved, setMoved] = useState(false);
  const g = useRef<{ id: string; startY: number; from: number } | null>(null);
  const rtl = isRTL();

  // The demonstration: the bottom card is picked up by its handle and taken
  // to the top. Stops as soon as someone grabs a handle themselves.
  const k = useSteps([700, 1200, 1900, 2500], 2200, touched);
  useEffect(() => {
    if (touched) return;
    if (k === 0) {
      setOrder(cards.map((c) => c.id));
      setLifted(null);
    }
    if (k === 2) setLifted('money');
    if (k === 3) setOrder(['money', 'habits', 'sleep']);
    if (k === 4) setLifted(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, touched]);

  const down = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!touched) {
      setTouched(true);
      setOrder(order);
    }
    navigator.vibrate?.(10);
    g.current = { id, startY: e.clientY, from: order.indexOf(id) };
    setLifted(id);
    setDy(0);
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s) return;
    const d = e.clientY - s.startY;
    setDy(d);
    const to = Math.max(0, Math.min(cards.length - 1, Math.round(s.from + d / STEP)));
    const cur = order.indexOf(s.id);
    if (to !== cur) {
      const next = order.filter((x) => x !== s.id);
      next.splice(to, 0, s.id);
      setOrder(next);
      navigator.vibrate?.(6);
    }
  };
  const up = () => {
    const s = g.current;
    g.current = null;
    if (s && order.indexOf(s.id) !== s.from) setMoved(true);
    setLifted(null);
    setDy(0);
  };

  const handleX = rtl ? 300 - 22 : 22;
  return (
    <div data-interactive style={{ position: 'relative', width: 300, height: cards.length * STEP + 30 }}>
      {cards.map((c) => {
        const idx = order.indexOf(c.id);
        const isLifted = lifted === c.id;
        const userDrag = isLifted && g.current;
        // While a finger holds it, the card follows the finger exactly.
        const y = userDrag ? g.current!.from * STEP + dy : idx * STEP;
        return (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: CARD_H,
              transform: `translateY(${y}px) scale(${isLifted ? 1.04 : 1})`,
              transition: userDrag ? 'transform .05s linear, box-shadow .2s' : 'transform .5s cubic-bezier(.3,1.25,.5,1), box-shadow .3s',
              zIndex: isLifted ? 5 : 1,
              borderRadius: 18,
              background: isLifted ? '#24242c' : '#1a1a20',
              border: `1px solid ${isLifted ? 'rgba(255,255,255,.22)' : 'var(--card-line)'}`,
              boxShadow: isLifted ? '0 24px 40px -14px rgba(0,0,0,.8)' : '0 8px 20px -14px rgba(0,0,0,.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingInlineEnd: 14,
            }}
          >
            {/* The handle: the only place that moves a card. */}
            <div
              role="button"
              aria-label={t('Move')}
              onPointerDown={down(c.id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', flex: 'none' }}
            >
              <Grip />
            </div>
            <span style={{ width: 34, height: 34, borderRadius: 11, background: glow(20), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Glyph name={c.icon} size={17} color={tone(70)} sw={2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--ink)' }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{c.sub}</div>
            </div>
          </div>
        );
      })}
      {!touched && <Finger x={handleX} y={(k >= 3 ? 0 : 2) * STEP + CARD_H / 2} on={k >= 1 && k < 4} pressing={k === 2 || k === 3} />}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, color: moved ? 'var(--ink)' : 'var(--ink3)', animation: moved ? 'popIn .5s cubic-bezier(.3,1.5,.5,1) both' : 'hintPulse 1.8s ease-in-out infinite' }}>
        {moved ? t('That’s it. Your Home, your order.') : t('Grab a ⋮⋮ handle and drag')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Counters: count anything (try it)

const EXAMPLES = [tk('Glasses of water'), tk('Pages read'), tk('Push-ups'), tk('Coffees'), tk('Days without sugar'), tk('Cigarettes avoided')];

export function CounterVisual() {
  const goal = 8;
  const [n, setN] = useState(5);
  const [touched, setTouched] = useState(false);
  const [pops, setPops] = useState<number[]>([]);
  const [ex, setEx] = useState(0);
  const k = useSteps([900, 1600], 3000, touched);
  useEffect(() => {
    if (touched) return;
    if (k === 0) setN(5);
    if (k >= 1) setN(5 + k);
    if (k >= 1) setPops((p) => [...p.slice(-3), Date.now()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, touched]);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setEx((e) => (e + 1) % EXAMPLES.length), 1700);
    return () => clearInterval(id);
  }, []);
  const add = () => {
    if (!touched) setTouched(true);
    navigator.vibrate?.(10);
    setN((v) => v + 1);
    setPops((p) => [...p.slice(-3), Date.now()]);
  };
  const size = 168;
  const sw = 12;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const reached = n >= goal;
  return (
    <div data-interactive style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={sw} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={reached ? tone(45) : A}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(1, n / goal))}
            style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.3,1.3,.5,1), stroke .4s', filter: `drop-shadow(0 0 10px ${glow(reached ? 80 : 55)})` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="display" style={{ fontSize: 56, lineHeight: 1, color: 'var(--ink)' }}>
            <RollingText key={n} text={String(n)} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>{t('of {n} today', { n: goal })}</div>
        </div>
        {pops.map((p) => (
          <span key={p} aria-hidden style={{ position: 'absolute', left: '50%', top: 18, marginLeft: -14, fontSize: 15, fontWeight: 800, color: tone(60), animation: 'floatUp 1s ease-out both', pointerEvents: 'none' }}>
            +1
          </span>
        ))}
        {reached && <Burst key={n === goal ? 'g' : 'x'} />}
      </div>
      {/* What's being counted keeps changing, because it can be anything. */}
      <div style={{ height: 22, overflow: 'hidden', position: 'relative', width: 260, textAlign: 'center' }}>
        <div key={ex} style={{ fontSize: 15, fontWeight: 650, color: 'var(--ink)', animation: 'slotUp .45s cubic-bezier(.2,.8,.2,1) both' }}>
          {t(EXAMPLES[ex])}
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('Add one')}
        onClick={add}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), add())}
        className="press92"
        style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)', boxShadow: 'inset 0 0 14px rgba(255,255,255,.12), 0 14px 30px -12px rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: touched ? undefined : 'glowRing 1.8s ease-in-out infinite' }}
      >
        <Glyph name="plus" size={26} color="#fff" sw={2.4} />
        {!touched && k >= 1 && k <= 2 && <span key={k} style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid rgba(255,255,255,.7)', animation: 'ripple .6s ease-out both' }} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Money: bank alerts become entries; declined ones don't

export function MoneyVisual() {
  // 1 alert in · 2 it becomes an entry · 3 budget fills · 4 declined alert in · 5 stamped · 6 it leaves
  const k = useSteps([500, 1600, 2300, 3500, 4200, 5400], 1600);
  const bubble = (style: React.CSSProperties, sender: string, text: string, extra?: React.ReactNode) => (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        padding: '10px 12px',
        borderRadius: 18,
        background: 'rgba(48,48,58,.92)',
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 16px 30px -12px rgba(0,0,0,.7)',
        transition: 'transform .55s cubic-bezier(.3,1.2,.5,1), opacity .4s',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <span style={{ width: 18, height: 18, borderRadius: 6, background: '#5b6271', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="receipt" size={11} color="#fff" sw={2} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{sender}</span>
        <span style={{ fontSize: 10.5, color: 'var(--ink3)', marginInlineStart: 'auto' }}>{t('now')}</span>
      </div>
      <div dir="ltr" style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--ink2)', textAlign: 'left' }}>{text}</div>
      {extra}
    </div>
  );
  const pct = k >= 3 ? 72 : 52;
  return (
    <div style={{ position: 'relative', width: 300, height: 300 }}>
      {/* The alert, as the phone shows it. */}
      {bubble(
        { top: 0, opacity: k >= 1 && k < 2 ? 1 : 0, transform: k < 1 ? 'translateY(-40px) scale(.96)' : k >= 2 ? 'translateY(120px) scale(.6)' : 'none' },
        'CIB',
        'Your card ending 1234 was charged EGP 245.00 at TALABAT.'
      )}
      {/* What Orbit made of it. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 104, borderRadius: 20, background: 'var(--card)', border: '1px solid var(--card-line)', padding: '6px 0' }}>
        {k >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', animation: 'popIn .5s cubic-bezier(.3,1.4,.5,1) both' }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: glow(22), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="coin" size={16} color={tone(70)} sw={2} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>Talabat</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{t('Eating out · from your bank')}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>−{money0(245)}</div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', borderTop: k >= 2 ? '1px solid rgba(255,255,255,.07)' : 'none' }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="cash" size={16} color="rgba(255,255,255,.7)" sw={2} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>Carrefour</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{t('Groceries · yesterday')}</div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>−{money0(860)}</div>
        </div>
      </div>
      {/* The budget it counts against. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: k >= 2 ? 236 : 186, transition: 'top .5s cubic-bezier(.3,1.2,.5,1)' }}>
        <div style={{ display: 'flex', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
          <span style={{ flex: 1 }}>{t('Eating out')}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            <RollingText key={pct} text={`${pct}%`} />
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 9, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9, background: `linear-gradient(90deg, ${tone(45)}, ${A})`, transition: 'width .9s cubic-bezier(.3,1.2,.5,1)' }} />
        </div>
      </div>
      {/* A declined one: read, stamped, and left out. */}
      {bubble(
        { top: 0, opacity: k >= 4 && k < 6 ? 1 : 0, transform: k < 4 ? 'translateY(-40px) scale(.96)' : k >= 6 ? 'translateX(110%) rotate(6deg)' : 'none', zIndex: 3 },
        'CIB',
        'Your purchase of EGP 3,200.00 at B.TECH was declined.',
        <div style={{ height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          {k >= 5 && (
            <div style={{ padding: '4px 9px', borderRadius: 8, border: '2px solid rgba(255,255,255,.85)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: 'rgba(20,20,24,.8)', animation: 'stamp .45s cubic-bezier(.3,1.4,.5,1) both' }}>
              {t('Declined, not counted')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Watch it add up: trends, stories, the morning brief

export function InsightsVisual() {
  const bars = [42, 64, 50, 78, 58, 88, 70];
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const pts = bars.map((b, i) => `${18 + i * 34},${118 - b}`).join(' ');
  return (
    <div style={{ position: 'relative', width: 300, height: 290 }} aria-hidden>
      {/* A week of sleep, bars growing in and a line drawn through them. */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 250, borderRadius: 22, background: 'var(--card)', border: '1px solid var(--card-line)', padding: '14px 14px 10px', animation: 'rise .55s cubic-bezier(.2,.8,.2,1) both' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>{t('Sleep this week')}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2, letterSpacing: '-.02em' }}>
          <RollingText text={t('{h}h {m}m', { h: 7, m: '12' })} delay={0.3} />
        </div>
        <div style={{ position: 'relative', height: 120, marginTop: 6 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 4px' }}>
            {bars.map((b, i) => (
              <div key={i} style={{ flex: 1, height: `${b}%`, borderRadius: 7, background: i === 6 ? A : glow(40), transformOrigin: 'bottom', animation: `barGrow .7s cubic-bezier(.3,1.4,.5,1) ${0.25 + i * 0.07}s both` }} />
            ))}
          </div>
          <svg width="222" height="120" viewBox="0 0 222 120" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="400" style={{ ['--len' as string]: 400, animation: 'drawLine 1.3s cubic-bezier(.65,0,.35,1) .9s both', opacity: 0.85 } as React.CSSProperties} />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '6px 4px 0' }}>
          {days.map((d, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--ink3)' }}>
              {d}
            </span>
          ))}
        </div>
      </div>
      {/* A story of the month, flicking in. */}
      <div style={{ position: 'absolute', insetInlineEnd: 0, top: 70, width: 112, height: 184, borderRadius: 18, background: `radial-gradient(circle at 50% 35%, ${glow(40)}, transparent 65%), #0e0e12`, border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 40px -16px rgba(0,0,0,.8)', padding: '9px 9px', transform: 'rotate(6deg)', animation: 'popIn .7s cubic-bezier(.3,1.4,.5,1) .7s both', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 3, width: '100%' }}>
          {[1, 1, 0.5, 0].map((f, i) => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 9, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
              <div style={{ width: `${f * 100}%`, height: '100%', background: '#fff' }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 30, fontSize: 10.5, fontWeight: 600, color: 'var(--ink2)' }}>{t('Workouts')}</div>
        <div className="display" style={{ fontSize: 44, lineHeight: 1, color: '#fff', marginTop: 4 }}>
          <RollingText text="18" delay={1} />
        </div>
        <div style={{ width: 26, height: 2.5, borderRadius: 9, background: A, marginTop: 8 }} />
        <div style={{ fontSize: 9.5, color: 'var(--ink3)', marginTop: 8, textAlign: 'center' }}>{t('this month')}</div>
      </div>
      {/* The morning brief: a sun coming up. */}
      <div style={{ position: 'absolute', insetInlineStart: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px 9px 10px', borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', animation: 'rise .55s cubic-bezier(.2,.8,.2,1) 1.2s both' }}>
        <span style={{ position: 'relative', width: 26, height: 18, overflow: 'hidden', display: 'block' }}>
          <span style={{ position: 'absolute', left: 4, bottom: -9, width: 18, height: 18, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, #fff, ${tone(45)})`, animation: 'sunrise 1.6s cubic-bezier(.2,.8,.2,1) 1.4s both' }} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, background: 'rgba(255,255,255,.6)' }} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink)' }}>{t('Your morning brief')}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Make it yours: pick what to track

export const TRACKERS: { key: string; label: string; icon: GlyphName; color: string }[] = [
  { key: 'habits', label: tk('Habits'), icon: 'sprout', color: COLORS.teal },
  { key: 'workouts', label: tk('Workouts'), icon: 'dumbbell', color: COLORS.coral },
  { key: 'sleep', label: tk('Sleep'), icon: 'bed', color: COLORS.blue },
  { key: 'finances', label: tk('Finances'), icon: 'wallet', color: COLORS.emerald },
  { key: 'counters', label: tk('Counters'), icon: 'tally', color: COLORS.indigo },
  { key: 'todos', label: tk('To-do lists'), icon: 'check', color: COLORS.amber },
];

export function YoursVisual({ picked, onToggle }: { picked: string[]; onToggle: (key: string) => void }) {
  const [shake, setShake] = useState<string | null>(null);
  return (
    <div data-interactive style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, width: 312 }}>
      {TRACKERS.map((m, i) => {
        const on = picked.includes(m.key);
        return (
          <div
            key={m.key}
            role="checkbox"
            aria-checked={on}
            aria-label={t(m.label)}
            tabIndex={0}
            onClick={() => {
              if (on && picked.length === 1) {
                // At least one stays on: an app tracking nothing is an empty screen.
                setShake(m.key);
                window.setTimeout(() => setShake(null), 450);
                return;
              }
              navigator.vibrate?.(10);
              onToggle(m.key);
            }}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), (e.currentTarget as HTMLElement).click())}
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              borderRadius: 22,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              cursor: 'pointer',
              background: on ? `color-mix(in srgb, ${m.color} 20%, rgba(255,255,255,.04))` : 'rgba(255,255,255,.04)',
              border: `1.5px solid ${on ? `color-mix(in srgb, ${m.color} 70%, transparent)` : 'rgba(255,255,255,.1)'}`,
              boxShadow: on ? `0 0 26px -8px ${m.color}` : 'none',
              transform: on ? 'scale(1)' : 'scale(.95)',
              transition: 'background .3s, border-color .3s, box-shadow .4s, transform .4s cubic-bezier(.3,1.5,.5,1)',
              animation: shake === m.key ? 'shake .4s ease both' : `popIn .55s cubic-bezier(.3,1.4,.5,1) ${0.1 + i * 0.06}s both`,
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: on ? m.color : 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .3s' }}>
              <Glyph name={m.icon} size={20} color={on ? '#0c0c0f' : 'rgba(255,255,255,.6)'} sw={2.1} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 650, color: on ? 'var(--ink)' : 'var(--ink3)', textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>{t(m.label)}</span>
            <span style={{ position: 'absolute', top: 8, insetInlineEnd: 8, width: 18, height: 18, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(.4)', transition: 'opacity .2s, transform .35s cubic-bezier(.3,1.6,.5,1)' }}>
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: '#0c0c0f', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M2.5 6.2l2.3 2.3 4.7-5" />
              </svg>
            </span>
          </div>
        );
      })}
    </div>
  );
}
