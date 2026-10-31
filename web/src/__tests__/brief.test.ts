import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrief, briefDue, briefSchedule, markBriefRead, teaserLine, type BriefPrefs } from '../lib/brief';
import { dayKey } from '../lib/format';
import type { AppState, Txn } from '../types';

// Tests run without a browser: a small stand-in for this phone's storage.
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};

const DAY = 86_400_000;
// Saturday 31 October 2026, 8:30 in the morning.
const NOW = new Date(2026, 9, 31, 8, 30).getTime();
const at = (daysAgo: number, hour: number) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
const money = { safe: null, budgets: [], reviewCount: 0 };

function state(over: Partial<AppState> = {}): AppState {
  return {
    profile: { modules: null },
    habits: [],
    checkins: [],
    txns: [],
    nights: [],
    workouts: [],
    recurring: [],
    ...over,
  } as unknown as AppState;
}

const txn = (name: string, amount: number, ts: number, cat = 'Food') =>
  ({ id: name + ts, name, cat, amount, income: amount > 0, accId: null, toAccId: null, adjust: false, note: null, photo: false, ts }) as Txn;

describe('morning brief', () => {
  beforeEach(() => localStorage.clear());

  it('reports last night against the two weeks before it', () => {
    const nights = [
      { id: 'n0', hours: 8, quality: 8, bedH: 23.5, wakeH: 7.5, note: null, ts: at(0, 7) },
      ...[1, 2, 3, 4].map((i) => ({ id: 'n' + i, hours: 7, quality: 7, bedH: 0, wakeH: 7, note: null, ts: at(i, 7) })),
    ];
    const b = buildBrief(state({ nights } as Partial<AppState>), money, NOW);
    expect(b.sleep).toEqual({ hours: 8, quality: 8, bedH: 23.5, diffMin: 60 });
    expect(b.sleepTracked).toBe(true);
  });

  it('leaves last night empty, but asks for it, when it isn’t logged yet', () => {
    const nights = [{ id: 'n1', hours: 7, quality: 7, bedH: 0, wakeH: 7, note: null, ts: at(1, 7) }];
    const b = buildBrief(state({ nights } as Partial<AppState>), money, NOW);
    expect(b.sleep).toBeNull();
    expect(b.sleepTracked).toBe(true);
  });

  it('lists today’s habits and the one not to miss twice', () => {
    const habits = [
      { id: 'a', name: 'Read', days: '1111111', cue: 'In bed', why: 'Calmer nights', paused: false, archived: false, locked: false },
      { id: 'b', name: 'Run', days: '0100000', cue: null, why: null, paused: false, archived: false, locked: false }, // Mondays only
      { id: 'c', name: 'Stretch', days: '1111111', cue: null, why: null, paused: true, archived: false, locked: false },
    ];
    // Read was done two days ago, missed yesterday.
    const checkins = [{ habitId: 'a', day: dayKey(at(2, 12)) }];
    const b = buildBrief(state({ habits, checkins } as unknown as Partial<AppState>), money, NOW);
    expect(b.habits.map((h) => h.name)).toEqual(['Read']);
    expect(b.habits[0].cue).toBe('In bed');
    expect(b.slip).toEqual({ id: 'a', name: 'Read', why: 'Calmer nights' });
  });

  it('sums yesterday’s spending and names the place only when it was most of it', () => {
    const txns = [txn('Carrefour', -900, at(1, 13)), txn('Uber', -100, at(1, 9)), txn('Salary', 30000, at(1, 10)), txn('Today', -50, at(0, 8))];
    const b = buildBrief(state({ txns }), money, NOW);
    expect(b.spentYesterday).toBe(1000);
    expect(b.topYesterday).toBe('Carrefour');
    const spread = buildBrief(state({ txns: [txn('Costa', -100, at(1, 9)), txn('Uber', -100, at(1, 10)), txn('Talabat', -100, at(1, 20))] }), money, NOW);
    expect(spread.topYesterday).toBeNull();
  });

  it('shows bills due in the next three days, nearest first', () => {
    const r = (name: string, inDays: number, amount = 100) => ({ id: name, name, cat: 'Bills', accId: null, amount, freq: 'Monthly', income: false, nextTs: at(-inDays, 9) });
    const recurring = [r('Gym', 3, 1100), r('Netflix', 0, 240), r('Rent', 9, 9500), r('Vodafone', 1, 420)];
    const b = buildBrief(state({ recurring } as unknown as Partial<AppState>), money, NOW);
    expect(b.bills).toEqual([
      { name: 'Netflix', amount: 240, inDays: 0 },
      { name: 'Vodafone', amount: 420, inDays: 1 },
      { name: 'Gym', amount: 1100, inDays: 3 },
    ]);
  });

  it('keeps only budgets that are close to or past their limit', () => {
    const b = buildBrief(state({ txns: [txn('x', -1, at(3, 9))] }), { safe: { left: 3000, perDay: 1500, daysLeft: 2 }, budgets: [{ cat: 'Food', pct: 50 }, { cat: 'Coffee', pct: 112 }, { cat: 'Fun', pct: 85 }], reviewCount: 2 }, NOW);
    expect(b.budgetsNear).toEqual([{ cat: 'Coffee', pct: 112 }, { cat: 'Fun', pct: 85 }]);
    expect(b.safe?.perDay).toBe(1500);
    expect(b.toReview).toBe(2);
  });

  it('says when the last workout was and how the week compares', () => {
    const w = (daysAgo: number) => ({ id: 'w' + daysAgo, name: 'Push', catId: null, dur: 45, dist: null, kcal: null, intensity: null, note: null, sets: null, ts: at(daysAgo, 18) });
    // Three a week for the eight weeks before, one in the last seven days.
    const workouts = [w(2), ...Array.from({ length: 24 }, (_, i) => w(8 + Math.floor((i * 56) / 24)))];
    const b = buildBrief(state({ workouts } as unknown as Partial<AppState>), money, NOW);
    expect(b.training).toMatchObject({ lastName: 'Push', daysSince: 2, lastWeek: 1, usual: 3 });
  });

  it('leaves out trackers the person turned off', () => {
    const s = state({ profile: { modules: ['habits'] }, txns: [txn('Carrefour', -900, at(1, 13))], nights: [{ id: 'n', hours: 8, quality: 8, bedH: 0, wakeH: 8, note: null, ts: at(0, 8) }] } as unknown as Partial<AppState>);
    const b = buildBrief(s, money, NOW);
    expect(b.sleep).toBeNull();
    expect(b.sleepTracked).toBe(false);
    expect(b.spentYesterday).toBe(0);
  });
});

describe('when the brief is offered', () => {
  beforeEach(() => localStorage.clear());
  const prefs: BriefPrefs = { on: true, time: '08:00' };
  const time = (h: number, m = 0) => new Date(2026, 9, 31, h, m).getTime();

  it('is on Home from early morning until 3 p.m., until it’s read', () => {
    expect(briefDue(time(3, 59), prefs)).toBe(false);
    expect(briefDue(time(4), prefs)).toBe(true);
    expect(briefDue(time(14, 59), prefs)).toBe(true);
    expect(briefDue(time(15), prefs)).toBe(false);
    markBriefRead(time(9));
    expect(briefDue(time(10), prefs)).toBe(false);
    expect(briefDue(time(10) + DAY, prefs)).toBe(true);
    expect(briefDue(time(10) + DAY, { ...prefs, on: false })).toBe(false);
  });

  it('schedules the next two weeks of mornings, skipping today once it’s read or past', () => {
    const s = state({ checkins: [{ habitId: 'a', day: '2026-10-30' }] } as unknown as Partial<AppState>);
    const early = briefSchedule(s, prefs, time(6));
    expect(early).toHaveLength(14);
    expect(early[0].at.getHours()).toBe(8);
    expect(dayKey(early[0].at.getTime())).toBe('2026-10-31');
    expect(briefSchedule(s, prefs, time(9))).toHaveLength(13);
    markBriefRead(time(6, 30));
    expect(dayKey(briefSchedule(s, prefs, time(7))[0].at.getTime())).toBe('2026-11-01');
    expect(briefSchedule(s, { ...prefs, on: false }, time(6))).toEqual([]);
    expect(briefSchedule(state(), prefs, time(6))).toEqual([]); // nothing logged yet
  });

  it('writes each morning’s line from what’s known the night before', () => {
    const habits = [{ id: 'a', name: 'Read', days: '1111111', paused: false, archived: false, locked: false }, { id: 'b', name: 'Run', days: '0000001', paused: false, archived: false, locked: false }];
    const recurring = [{ id: 'r', name: 'Netflix', amount: 240, income: false, freq: 'Monthly', nextTs: time(9) + DAY }];
    const s = state({ habits, recurring } as unknown as Partial<AppState>);
    expect(teaserLine(s, time(8))).toBe('2 habits on today’s list, plus last night and your money.'); // Saturday
    expect(teaserLine(s, time(8) + DAY)).toBe('Netflix is due today. Your brief has the rest.');
    expect(teaserLine(state(), time(8))).toBe('Last night, today’s plan and your money, in a minute.');
  });
});
