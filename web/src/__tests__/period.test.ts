// Run in a zone with daylight saving, so the tests can cross a clock change.
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { period, bucketOf, addDays, startOfDay, weekOfYear } from '../lib/period';
import { derive, deriveHabits } from '../lib/derive';
import type { AppState } from '../types';

const at = (iso: string) => new Date(iso).getTime();
// Thursday 22 October 2026, 18:00 local.
const NOW = at('2026-10-22T18:00:00');

const state = (over: Partial<AppState> = {}): AppState =>
  ({
    profile: { createdAt: NOW - 400 * 86400000, currency: 'EGP' },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [], milestones: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400 },
    ...over,
  }) as unknown as AppState;

const workout = (iso: string, dur = 60) => ({
  id: iso, name: 'W', catId: null, dur, dist: null, kcal: null, intensity: null, note: null, sets: null, ts: at(iso),
});

describe('periods are the calendar, not rolling windows', () => {
  it('a week runs Sunday to Saturday, with the days still to come marked', () => {
    const p = period('Week', 0, { now: NOW });
    expect(new Date(p.start).toDateString()).toBe('Sun Oct 18 2026');
    expect(p.buckets.map((b) => b.label).join('')).toBe('SMTWTFS');
    expect(p.buckets.findIndex((b) => b.current)).toBe(4); // Thursday
    expect(p.buckets.map((b) => b.future)).toEqual([false, false, false, false, false, true, true]);
    expect(p.caption).toBe('Oct 18 – 24');
    expect(p.title).toBe('This week');
  });

  it('"this year" is January to December — the old one ran November to October', () => {
    const p = period('Year', 0, { now: NOW });
    expect(p.buckets.map((b) => b.label).join('')).toBe('JFMAMJJASOND');
    expect(new Date(p.start).toDateString()).toBe('Thu Jan 01 2026');
    expect(p.buckets.filter((b) => b.future)).toHaveLength(2);
    expect(p.caption).toBe('Jan – Oct 2026');
  });

  it('labels a month weekly from the 1st, so no two labels collide', () => {
    // The old labels landed on yesterday and today at once, and overlapped.
    const p = period('Month', 0, { now: NOW });
    expect(p.buckets).toHaveLength(31);
    expect(p.buckets.map((b) => b.label).filter(Boolean)).toEqual(['1', '8', '15', '22', '29']);
  });

  it('steps back through earlier periods', () => {
    expect(period('Week', 1, { now: NOW }).caption).toBe('Oct 11 – 17');
    expect(period('Month', 1, { now: NOW }).title).toBe('Last month');
    expect(period('Month', 3, { now: NOW }).title).toBe('July');
    expect(period('Year', 1, { now: NOW }).caption).toBe('2025');
    expect(period('Week', 3, { now: NOW }).isCurrent).toBe(false);
  });

  it('names both months, and both years only when they differ', () => {
    const p = period('Week', 0, { now: at('2026-12-02T12:00:00') });
    expect(p.caption).toBe('Nov 29 – Dec 5');
    const q = period('Week', 0, { now: at('2027-01-01T12:00:00') });
    expect(q.caption).toBe('Dec 27, 2026 – Jan 2, 2027');
  });

  it('divides by the days that have happened, not the whole month', () => {
    expect(period('Month', 0, { now: at('2026-10-10T12:00:00') }).days).toBe(10);
    expect(period('Month', 1, { now: at('2026-10-10T12:00:00') }).days).toBe(30);
    expect(period('Week', 0, { now: NOW }).days).toBe(5);
  });

  it('keeps every bucket on midnight across the end of daylight saving', () => {
    // New York falls back on Sunday 1 November 2026. Stepping by 24 hours
    // from there put every later bucket an hour before midnight.
    const p = period('Week', 0, { now: at('2026-11-04T12:00:00') });
    for (const b of p.buckets) expect(new Date(b.start).getHours()).toBe(0);
    // An entry at 23:30 on Monday 2 November belongs to Monday.
    const i = bucketOf(p.buckets, at('2026-11-02T23:30:00'));
    expect(p.buckets[i].name).toContain('Monday');
  });

  it('gives "all time" at least a few months and labels the newest one', () => {
    const p = period('All', 0, { now: NOW, earliest: at('2026-09-03T10:00:00') });
    expect(p.buckets).toHaveLength(6);
    expect(p.buckets[p.buckets.length - 1].label).toBe('O');
    expect(p.caption).toBe('Since Sep 2026');
  });

  it('numbers weeks within the year', () => {
    expect(weekOfYear(NOW).week).toBe(43);
    expect(weekOfYear(at('2026-01-01T12:00:00')).week).toBe(1);
  });

  it('adds calendar days, not 24-hour blocks', () => {
    const sat = at('2026-10-31T00:00:00');
    expect(new Date(addDays(sat, 1)).getHours()).toBe(0);
    expect(new Date(addDays(sat, 2)).getDate()).toBe(2);
    expect(startOfDay(addDays(sat, 2))).toBe(addDays(sat, 2));
  });
});

describe('charts follow the calendar', () => {
  it('puts each workout in its month and leaves future months empty', () => {
    const d = derive(state({ workouts: [workout('2026-01-15T18:00:00', 50), workout('2026-10-02T18:00:00', 40)] as any }), 'Year', 0, NOW);
    expect(d.wMinBuckets[0]).toBe(50);
    expect(d.wMinBuckets[9]).toBe(40);
    expect(d.wMinBuckets[10]).toBeNull(); // November hasn't happened
    expect(d.currentIdx).toBe(9);
  });

  it('places nights on their days, with gaps where none was logged', () => {
    const n = (iso: string) => ({ id: iso, hours: 7, quality: 7, bedH: 23, wakeH: 6, note: null, ts: at(iso) });
    const d = derive(state({ nights: [n('2026-10-19T06:00:00'), n('2026-10-22T06:30:00')] as any }), 'Week', 0, NOW);
    expect(d.sleepSlots.map((x) => (x ? 1 : 0))).toEqual([0, 1, 0, 0, 1, 0, 0]);
  });

  it('compares this week so far with the same days of last week', () => {
    // Two workouts by Thursday this week, two by Thursday last week and two
    // more after it. Against the whole of last week this read as -50%.
    const d = derive(
      state({
        workouts: [
          workout('2026-10-19T18:00:00'),
          workout('2026-10-21T18:00:00'),
          workout('2026-10-12T18:00:00'),
          workout('2026-10-14T18:00:00'),
          workout('2026-10-16T18:00:00'),
          workout('2026-10-17T18:00:00'),
        ] as any,
      }),
      'Week',
      0,
      NOW
    );
    expect(d.deltas.workouts).toBe(0);
  });
});

describe('habit weeks', () => {
  const habit = { id: 'h', name: 'Read', color: 'teal', target: '', locked: false, days: '1111111', paused: false, archived: false, why: null, reminderTime: null };

  it('does not call a week secured after one check-in on a Sunday', () => {
    const sunday = at('2026-10-18T09:00:00');
    const h = deriveHabits(state({ habits: [habit], checkins: [{ habitId: 'h', day: '2026-10-18' }] } as any), 'Week', 0, sunday);
    expect(h.weekTotal).toBe(1); // scheduled so far
    expect(h.weekPlanned).toBe(7);
    expect(h.weekGoal).toBe(5);
    expect(h.weekSecured).toBe(false);
  });

  it('counts "this week" from Sunday, matching the circles under each habit', () => {
    const days = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-20'];
    const h = deriveHabits(state({ habits: [habit], checkins: days.map((day) => ({ habitId: 'h', day })) } as any), 'Week', 0, NOW);
    expect(h.weekDone).toBe(2); // Sunday and Tuesday; last Thursday–Saturday belong to last week
    expect(h.weekTotal).toBe(5); // Sunday to Thursday
    expect(h.habits[0].weekSlots).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });

  it('keeps a streak running across the night the clocks change', () => {
    const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
    const h = deriveHabits(state({ habits: [habit], checkins: days.map((day) => ({ habitId: 'h', day })) } as any), 'Week', 0, at('2026-11-03T20:00:00'));
    expect(h.longestStreak).toBe(5);
    expect(h.habits[0].streak).toBe(5);
  });
});
