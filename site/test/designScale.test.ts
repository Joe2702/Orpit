import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The website's type scale and spacing grid, kept from drifting.
//
// It had grown 20 font sizes, 10 weights and spacing about half off any grid.
// These read the stylesheet and every inline style and fail on a value off
// the scale, naming the file and line.
//
// Text: 11 (axis labels, badges, keys), 12 (labels, meta), 14 (body, controls,
// tables), 16 (titles), 20 (headings). Display: 28 and 40. Weights: 400, 500,
// 600, 700. Spacing: multiples of 4, with 1px and 2px allowed as optical
// nudges and 100px and up as layout constants.

const TYPE = [11, 12, 14, 16, 20, 28, 40];
const WEIGHTS = [400, 500, 600, 700];
const onGrid = (v: number) => Math.abs(v) <= 2 || Math.abs(v) >= 100 || Math.abs(v) % 4 === 0;

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const files: { name: string; css: boolean; lines: string[] }[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(e.name)) files.push({ name: path.relative(SRC, p), css: e.name.endsWith('.css'), lines: fs.readFileSync(p, 'utf8').split('\n') });
  }
};
walk(SRC);

/** Numbers an inline style value can resolve to: a literal, a ternary's branches, or px inside a string. */
function jsValues(expr: string): number[] {
  const e = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(e)) return [Number(e)];
  const out: number[] = [];
  for (const m of e.matchAll(/[?:]\s*(-?\d+(?:\.\d+)?)(?=\s*(?::|$))/g)) out.push(Number(m[1]));
  for (const s of e.matchAll(/(['"`])([^'"`]*)\1/g)) for (const m of s[2].matchAll(/(\d+(?:\.\d+)?)px/g)) out.push(Number(m[1]));
  return out;
}

function check(css: RegExp, js: RegExp, ok: (v: number) => boolean, weights = false) {
  const bad: string[] = [];
  for (const f of files)
    f.lines.forEach((line, i) => {
      for (const m of line.matchAll(f.css ? css : js)) {
        const vals = f.css ? [...m[1].matchAll(weights ? /\b(\d{3})\b/g : /(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1])) : weights ? [...m[1].matchAll(/\b(\d{3})\b/g)].map((x) => Number(x[1])) : jsValues(m[1]);
        for (const v of vals) if (!ok(v)) bad.push(`${f.name}:${i + 1} ${v}`);
      }
    });
  return bad;
}

describe('Design scale', () => {
  it('uses only the type scale', () => {
    expect(check(/font-size:\s*([^;]+);/g, /\bfontSize\s*:\s*([^,}\n]+)/g, (v) => TYPE.includes(v))).toEqual([]);
  });

  it('uses only the four weights', () => {
    expect(check(/font-weight:\s*([^;]+);/g, /\bfontWeight\s*:\s*([^,}\n]+)/g, (v) => WEIGHTS.includes(v), true)).toEqual([]);
  });

  it('keeps spacing on the 4-point grid', () => {
    expect(
      check(
        /\b(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?\s*:\s*([^;{}]+);/g,
        /\b(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?\s*:\s*([^,}\n]+)/g,
        onGrid
      )
    ).toEqual([]);
  });
});
