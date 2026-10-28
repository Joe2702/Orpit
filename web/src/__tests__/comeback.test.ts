import { describe, it, expect } from 'vitest';
import { missedRun } from '../lib/comeback';
import { dayKey } from '../lib/format';

const NOW = new Date(2026, 9, 28, 10).getTime(); // a Wednesday
const ago = (n: number) => dayKey(NOW - n * 86_400_000);

describe('missed scheduled days before today', () => {
  it('is 0 when yesterday was done', () => {
    expect(missedRun('1111111', new Set([ago(1)]), NOW)).toBe(0);
  });

  it('counts back to the last time it was done', () => {
    expect(missedRun('1111111', new Set([ago(4)]), NOW)).toBe(3);
  });

  it('skips days the habit is not scheduled', () => {
    // Mon, Wed, Fri only. Done last Friday; Monday missed; yesterday (Tue) is
    // not a habit day. So one scheduled day was missed.
    const mwf = '0101010';
    expect(missedRun(mwf, new Set([ago(5)]), NOW)).toBe(1);
  });

  it('has no lapse for a habit never done', () => {
    expect(missedRun('1111111', new Set(), NOW)).toBe(0);
  });

  it('stops counting at the limit', () => {
    expect(missedRun('1111111', new Set([ago(200)]), NOW, 30)).toBe(30);
  });
});
