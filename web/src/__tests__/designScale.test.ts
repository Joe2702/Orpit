import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The phone app's type scale and spacing grid, kept from drifting.
//
// It had grown to 37 font sizes, 9 weights and spacing that was half off any
// grid, one hand-picked value at a time. These read every inline style in the
// app and fail on a size, weight or gap outside the scale, naming the file
// and line so the fix is a lookup, not a hunt.
//
// Text: 11 (badges, axis labels, tab labels), 13 (secondary), 15 (body),
// 17 (titles), 22 (headings). Display, mostly the serif: 28, 34, 40, 56, and
// the wordmark and ornaments above that. Weights: 400, 500, 600, 700.
// Spacing: multiples of 4. 1px and 2px stay allowed as optical nudges and
// hairlines, and 100px and up are layout constants rather than spacing.

const TEXT = [11, 13, 15, 17, 22];
const DISPLAY = [28, 34, 40, 56];
const WEIGHTS = [400, 500, 600, 700];
// Illustrated scenes (the onboarding animation, the story reports) draw
// miniature phones and posters at their own sizes.
const SKIP = new Set(['screens/IntroScenes.tsx', 'screens/StoryReport.tsx']);

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files: { name: string; lines: string[] }[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'i18n') walk(p);
    } else if (/\.tsx?$/.test(e.name)) {
      const name = path.relative(SRC, p).split(path.sep).join('/');
      if (!SKIP.has(name)) files.push({ name, lines: fs.readFileSync(p, 'utf8').split('\n') });
    }
  }
};
walk(SRC);

/** Numbers a style value can resolve to: a literal, a ternary's branches, or px inside a string. */
function values(expr: string): number[] {
  const e = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(e)) return [Number(e)];
  const out: number[] = [];
  for (const m of e.matchAll(/[?:]\s*(-?\d+(?:\.\d+)?)(?=\s*(?::|$))/g)) out.push(Number(m[1]));
  for (const s of e.matchAll(/(['"`])([^'"`]*)\1/g)) for (const m of s[2].matchAll(/(\d+(?:\.\d+)?)px/g)) out.push(Number(m[1]));
  return out;
}

function offScale(prop: RegExp, ok: (v: number) => boolean) {
  const bad: string[] = [];
  for (const f of files)
    f.lines.forEach((line, i) => {
      for (const m of line.matchAll(prop)) for (const v of values(m[1])) if (!ok(v)) bad.push(`${f.name}:${i + 1} ${v}`);
    });
  return bad;
}

describe('Design scale', () => {
  it('uses only the type scale', () => {
    const bad = offScale(/\bfontSize\s*:\s*([^,}\n]+)/g, (v) => TEXT.includes(v) || DISPLAY.includes(v) || v >= 64);
    expect(bad).toEqual([]);
  });

  it('uses only the four weights', () => {
    const bad: string[] = [];
    for (const f of files)
      f.lines.forEach((line, i) => {
        for (const m of line.matchAll(/\bfontWeight\s*:\s*([^,}\n]+)/g))
          for (const w of m[1].matchAll(/\b(\d{3})\b/g)) if (!WEIGHTS.includes(Number(w[1]))) bad.push(`${f.name}:${i + 1} ${w[1]}`);
      });
    expect(bad).toEqual([]);
  });

  it('keeps spacing on the 4-point grid', () => {
    const prop = /\b(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?\s*:\s*([^,}\n]+)/g;
    const bad = offScale(prop, (v) => {
      const a = Math.abs(v);
      return a <= 2 || a >= 100 || a % 4 === 0;
    });
    expect(bad).toEqual([]);
  });
});
