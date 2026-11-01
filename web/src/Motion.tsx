// Motion pieces for the story reports and the weekly review: numbers that
// roll into place like an odometer, words that rise in one after another, and
// a ring that draws itself. Each one renders its final state straight away
// when the phone asks for less motion.

import React, { useEffect, useState } from 'react';

export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const LAT = '0123456789';
const ARD = '٠١٢٣٤٥٦٧٨٩';
// A run of digits with the separators inside it: 9,450 · 7:30 · ٩٫٥ · ٩٬٤٥٠
const NUM_RUN = /[0-9٠-٩]+(?:[.,:٫٬][0-9٠-٩]+)*/g;
const H = 1.1; // each digit's box, in em, roomy enough for the display serif

/** Splits text into plain pieces and number runs. */
export function numberRuns(text: string): { num: boolean; s: string }[] {
  const out: { num: boolean; s: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(NUM_RUN)) {
    if (m.index! > last) out.push({ num: false, s: text.slice(last, m.index) });
    out.push({ num: true, s: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ num: false, s: text.slice(last) });
  return out;
}

function useStarted(delay: number) {
  const [on, setOn] = useState(reducedMotion);
  useEffect(() => {
    if (on) return;
    // Two frames, so the starting position is painted before it moves.
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setOn(true))));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { on, delay };
}

function Column({ ch, i, total, delay, on }: { ch: string; i: number; total: number; delay: number; on: boolean }) {
  const set = LAT.includes(ch) ? LAT : ARD;
  const d = set.indexOf(ch);
  // One full turn, then on to the digit: the last digits spin furthest.
  const target = 10 + d;
  const strip = set + set;
  return (
    <span style={{ display: 'inline-block', height: `${H}em`, overflow: 'hidden', verticalAlign: 'top' }}>
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${on ? -target * H : 0}em)`,
          transition: on ? `transform ${1.1 + (i / Math.max(1, total)) * 0.5}s cubic-bezier(.16,1,.3,1) ${delay + i * 0.06}s` : 'none',
        }}
      >
        {[...strip].map((c, k) => (
          <span key={k} style={{ height: `${H}em`, lineHeight: `${H}em`, textAlign: 'center' }}>
            {c}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Text with its numbers rolling into place. Each number run is kept
 * left-to-right in its own box, so "٩٫٥ ألف" and "E£9,450" both read right.
 */
export function RollingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const { on } = useStarted(delay);
  const runs = numberRuns(text);
  let col = 0;
  const digitsTotal = runs.filter((r) => r.num).reduce((n, r) => n + [...r.s].filter((c) => LAT.includes(c) || ARD.includes(c)).length, 0);
  return (
    <span aria-label={text} role="text" style={{ display: 'inline-block', lineHeight: `${H}em` }}>
      {runs.map((r, k) =>
        r.num ? (
          <span key={k} aria-hidden style={{ display: 'inline-flex', direction: 'ltr', unicodeBidi: 'isolate', verticalAlign: 'top' }}>
            {[...r.s].map((c, j) =>
              LAT.includes(c) || ARD.includes(c) ? (
                <Column key={j} ch={c} i={col++} total={digitsTotal} delay={delay} on={on} />
              ) : (
                <span key={j} style={{ display: 'inline-block', height: `${H}em`, lineHeight: `${H}em`, opacity: on ? 1 : 0, transition: `opacity .4s ${delay + 0.3}s` }}>
                  {c}
                </span>
              )
            )}
          </span>
        ) : (
          <span key={k} aria-hidden style={{ display: 'inline-block', whiteSpace: 'pre-wrap', opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(.25em)', transition: `opacity .5s ${delay + 0.15}s, transform .7s cubic-bezier(.2,.8,.2,1) ${delay + 0.15}s` }}>
            {r.s}
          </span>
        )
      )}
    </span>
  );
}

/** Words rising in one after another. Whole words, so Arabic stays joined. */
export function RisingWords({ text, delay = 0, step = 0.08 }: { text: string; delay?: number; step?: number }) {
  const words = text.split(/(\s+)/);
  let n = 0;
  return (
    <span dir="auto" aria-label={text} role="text">
      {words.map((w, k) =>
        /^\s+$/.test(w) ? (
          <span key={k} aria-hidden>
            {w}
          </span>
        ) : (
          <span key={k} aria-hidden style={{ display: 'inline-block', animation: `wordUp .7s cubic-bezier(.2,.8,.2,1) ${delay + n++ * step}s both` }}>
            {w}
          </span>
        )
      )}
    </span>
  );
}

/** A big value: rolling if it has a number in it, rising words if not. */
export function BigValue({ text, delay = 0 }: { text: string; delay?: number }) {
  return /[0-9٠-٩]/.test(text) ? <RollingText text={text} delay={delay} /> : <RisingWords text={text} delay={delay} step={0.1} />;
}

/** A ring that draws itself around something, in the given colour. */
export function DrawRing({ size, color, delay = 0, width = 2.5, children }: { size: number; color: string; delay?: number; width?: number; children?: React.ReactNode }) {
  const r = size / 2 - width;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={width} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ ['--ring' as string]: c, strokeDashoffset: 0, animation: `ringDraw 1.1s cubic-bezier(.65,0,.35,1) ${delay}s both` } as React.CSSProperties}
        />
      </svg>
      {children}
    </span>
  );
}
