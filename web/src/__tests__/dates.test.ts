import { describe, it, expect } from 'vitest';
import { dayKey } from '../lib/format';

// These cover the class of bug that filed habit check-ins under the wrong date:
// the client computes a LOCAL day key, so anything sent to the server must
// carry it explicitly. A server-side `new Date().toISOString()` is UTC, which
// disagrees with the client for part of every day east or west of Greenwich.

describe('dayKey', () => {
  it('uses the local date, not the UTC date', () => {
    // 2026-07-30 01:30 in UTC+3 is still 2026-07-29 22:30 UTC.
    const local = new Date(2026, 6, 30, 1, 30, 0);
    expect(dayKey(local.getTime())).toBe('2026-07-30');
    // Prove the naive implementation would have disagreed for this instant
    // whenever the machine is east of UTC.
    const utc = new Date(local.getTime()).toISOString().slice(0, 10);
    if (local.getTimezoneOffset() < 0) expect(utc).not.toBe('2026-07-30');
  });

  it('is stable across every hour of a day', () => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(2026, 0, 15, h, 30, 0);
      expect(dayKey(d.getTime())).toBe('2026-01-15');
    }
  });

  it('rolls over exactly at local midnight', () => {
    const before = new Date(2026, 2, 9, 23, 59, 59);
    const after = new Date(2026, 2, 10, 0, 0, 1);
    expect(dayKey(before.getTime())).toBe('2026-03-09');
    expect(dayKey(after.getTime())).toBe('2026-03-10');
  });

  it('pads month and day to two digits', () => {
    expect(dayKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05');
  });

  it('defaults to now and returns a well-formed key', () => {
    expect(dayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
