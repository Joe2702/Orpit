import { describe, it, expect } from 'vitest';
import { csvField, toCsv } from '../src/lib/csv';
import { habitHeatmap, perfectRun, sleepNights, trainingWeeks, dailySpend, monthlyFlow, byCategory, streakOf } from '../src/lib/series';
import { dayKey } from '@core/lib/format';
import type { AppState, Habit } from '@core/types';

const DAY = 86_400_000;
// Sunday 8 November 2026, mid-afternoon. Weeks start on Sunday, as on the phone.
const NOW = new Date(2026, 10, 8, 15).getTime();

describe('CSV', () => {
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

describe('series', () => {
  const s = {
    nights: [{ ts: NOW - DAY, hours: 7.5, bedH: 23, wakeH: 6.5, quality: 7 }, { ts: NOW, hours: 6, bedH: 0, wakeH: 6, quality: 5 }],
    workouts: [{ ts: NOW - DAY, dur: 40 }, { ts: NOW - 2 * DAY, dur: 30 }, { ts: NOW - 9 * DAY, dur: 50 }],
    habits: [{ id: 'a', days: '1111111', archived: false }, { id: 'b', days: '0111110', archived: false }],
    checkins: [{ habitId: 'a', day: dayKey(NOW) }, { habitId: 'b', day: dayKey(NOW - DAY) }, { habitId: 'a', day: dayKey(NOW - DAY) }, { habitId: 'a', day: dayKey(NOW - 2 * DAY) }],
    txns: [
      { amount: -300, cat: 'Food', ts: NOW - DAY, income: false, toAccId: null, adjust: false },
      { amount: -100, cat: 'Transport', ts: NOW - 2 * DAY, income: false, toAccId: null, adjust: false },
      { amount: 20000, cat: 'Salary', ts: NOW - 3 * DAY, income: true, toAccId: null, adjust: false },
      { amount: -999, cat: 'Food', ts: new Date(2026, 9, 20).getTime(), income: false, toAccId: null, adjust: false },
      { amount: -500, cat: 'Transfer', ts: NOW - DAY, income: false, toAccId: 'x', adjust: false },
    ],
  } as unknown as AppState;

  it('lines up nights, oldest first, with gaps where none was logged', () => {
    expect(sleepNights(s, 3, NOW).map((x) => x.hours)).toEqual([null, 7.5, 6]);
  });
  it('counts training per Sunday-to-Saturday week', () => {
    // Today is Sunday, so this week has nothing yet; Fri and Sat are last week.
    expect(trainingWeeks(s, 3, NOW).map((x) => [x.count, x.minutes])).toEqual([[1, 50], [2, 70], [0, 0]]);
  });
  it('shades days by the share of planned habits done, Sunday on top', () => {
    const grid = habitHeatmap(s, 2, NOW);
    const [sun] = grid[1];
    const [fri, sat] = [grid[0][5], grid[0][6]];
    expect(sun.share).toBe(1); // only "a" is planned on Sundays, and it's done
    expect(sat.share).toBe(1); // "b" isn't planned on Saturdays
    expect(fri.share).toBe(0.5); // both planned, "a" done
    expect(grid[1][1].future).toBe(true);
  });
  it('counts a perfect run, and today only once it is complete', () => {
    const c = (share: number | null) => ({ share, future: false });
    expect(perfectRun([[c(1), c(0.5), c(1), c(null), c(1), c(0.5)]])).toBe(2);
    expect(perfectRun([[c(1), c(1), c(1)]])).toBe(3);
    expect(perfectRun([[c(1), { share: null, future: true }]])).toBe(1);
  });
  it('measures a habit’s streak over its planned days', () => {
    expect(streakOf(s, s.habits[0] as Habit, NOW)).toBe(3);
  });
  it('adds up money without transfers, last month or income as spending', () => {
    const days = dailySpend(s, 3, NOW);
    expect(days.map((d) => d.amount)).toEqual([100, 300, 0]);
    const m = monthlyFlow(s, 2, NOW);
    expect(m.map((x) => [x.spent, x.income])).toEqual([[999, 0], [400, 20000]]);
    expect(byCategory(s, new Date(2026, 10, 1).getTime())).toEqual([{ cat: 'Food', amount: 300 }, { cat: 'Transport', amount: 100 }]);
  });
});
