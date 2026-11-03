import { describe, expect, it } from 'vitest';
import { lensField } from '../lib/liquid';

const at = (d: Uint8ClampedArray, w: number, x: number, y: number) => {
  const k = (y * w + x) * 4;
  return [d[k], d[k + 1]];
};

describe('the bend at the rim', () => {
  const w = 200;
  const h = 60;
  const d = lensField(w, h, 30, 14);

  it('leaves the middle alone', () => {
    expect(at(d, w, 100, 30)).toEqual([128, 128]);
  });

  it('pulls inward at every edge, hardest at the edge itself', () => {
    expect(at(d, w, 100, 0)[1]).toBeGreaterThan(240); // top: pull down
    expect(at(d, w, 100, h - 1)[1]).toBeLessThan(16); // bottom: pull up
    expect(at(d, w, 0, 30)[0]).toBeGreaterThan(240); // left: pull right
    expect(at(d, w, w - 1, 30)[0]).toBeLessThan(16); // right: pull left
    expect(at(d, w, 100, 4)[1]).toBeLessThan(at(d, w, 100, 0)[1]);
  });

  it('follows the rounded corners and does nothing outside them', () => {
    expect(at(d, w, 0, 0)).toEqual([128, 128]);
    const [r, g] = at(d, w, 10, 10);
    expect(r).toBeGreaterThan(128);
    expect(g).toBeGreaterThan(128);
  });
});
