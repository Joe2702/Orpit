import { describe, it, expect } from 'vitest';
import { csvField, toCsv } from '../lib/csv';
import { habitHeatmap, perfectRun, sleepNights, trainingWeeks } from '../desktop/dashData';
import { dayKey } from '../lib/format';
import type { AppState } from '../types';

const DAY = 86_400_000;
// Sunday 8 November 2026, mid-afternoon.
const NOW = new Date(2026, 10, 8, 15).getTime();

describe('CSV export', () => {
  it('quotes only what needs it, and keeps formulas out', () => {
    expect(csvField('Talabat')).toBe('Talabat');
    expect(csvField('Coffee, cake')).toBe('"Coffee, cake"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField(-245.5)).toBe('-245.5');
    expect(csvField(null)).toBe('');
  });
  it('starts with a byte-order mark so Excel reads Arabic', () => {
    const s = toCsv(['Name'], [['طلبات']]);
    expect(s.charCodeAt(0)).toBe(0xfeff);
    expect(s).toContain('طلبات');
  });
});

describe('dashboard numbers', () => {
  const s = {
    nights: [{ ts: NOW - DAY, hours: 7.5 }, { ts: NOW, hours: 6 }],
    workouts: [{ ts: NOW - DAY, dur: 40 }, { ts: NOW - 2 * DAY, dur: 30 }, { ts: NOW - 9 * DAY, dur: 50 }],
    habits: [{ id: 'a', days: '1111111', archived: false }, { id: 'b', days: '0111110', archived: false }],
    checkins: [{ habitId: 'a', day: dayKey(NOW) }, { habitId: 'b', day: dayKey(NOW - DAY) }, { habitId: 'a', day: dayKey(NOW - DAY) }],
  } as unknown as AppState;

  it('lines up nights, oldest first, with gaps where none was logged', () => {
    const n = sleepNights(s, 3, NOW);
    expect(n.map((x) => x.hours)).toEqual([null, 7.5, 6]);
  });
  it('counts workouts and minutes per week', () => {
    const w = trainingWeeks(s, 2, NOW);
    expect(w.map((x) => [x.count, x.minutes])).toEqual([[1, 50], [2, 70]]);
  });
  it('shades each day by the share of planned habits done', () => {
    const grid = habitHeatmap(s, 1, NOW); // this week, Monday to Sunday (today)
    const [fri, sat, sun] = [grid[0][4], grid[0][5], grid[0][6]];
    expect(sun.share).toBe(1); // b isn't planned on Sundays; a is, and it's done
    expect(sat.share).toBe(1); // a done; b not planned on Saturdays either
    expect(fri.share).toBe(0); // both planned, neither done
    expect(sun.future).toBe(false);
    // Seen from Wednesday, the rest of the week hasn't happened yet.
    const wed = habitHeatmap(s, 1, NOW - 4 * DAY);
    expect(wed[0][3].future).toBe(true);
    expect(wed[0][3].share).toBe(null);
  });
  it('counts a run of fully done days, and today only once it is complete', () => {
    const c = (share: number | null) => ({ share, future: false });
    expect(perfectRun([[c(1), c(0.5), c(1), c(null), c(1), c(0.5)]])).toBe(2); // today half done: run to yesterday
    expect(perfectRun([[c(1), c(1), c(1)]])).toBe(3);
    expect(perfectRun([[c(1), c(0), c(0)]])).toBe(0);
    expect(perfectRun([[c(1), c(1), { share: null, future: true }]])).toBe(2);
  });
});
