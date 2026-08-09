import { describe, it, expect } from 'vitest';
import { buildInsights } from '../lib/insights';
import { summarise } from '../lib/widget';
import { parseShortcut, parseScreen, parseTarget } from '../lib/shortcuts';
import { dayKey } from '../lib/format';
import type { AppState } from '../types';

// Insights are the one thing a single-purpose tracker can't do, so they have to
// be trustworthy: a finding that fires on noise is worse than no finding. These
// check both directions — that a real pattern is reported, and that thin or
// flat data stays silent.

const D = 86400000;
const emptyArchive = {
  workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0,
  txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400,
};

function base(over: Partial<AppState> = {}): AppState {
  return {
    profile: { createdAt: Date.now() - 200 * D, avatar: null },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [], archive: emptyArchive,
    ...over,
  } as unknown as AppState;
}
const ids = (s: AppState) => buildInsights(s).map((i) => i.id);
const daysAgo = (n: number) => Date.now() - n * D;

describe('keystone habit', () => {
  it('names the habit that coincides with getting more else done', () => {
    const habits = [
      { id: 'k', name: 'Morning run', days: '1111111', archived: false, paused: false, locked: false },
      { id: 'o', name: 'Read', days: '1111111', archived: false, paused: false, locked: false },
      { id: 'p', name: 'Stretch', days: '1111111', archived: false, paused: false, locked: false },
    ];
    const checkins: { habitId: string; day: string }[] = [];
    // 8 days with the keystone: the other two also get done.
    for (let i = 0; i < 8; i++) {
      const day = dayKey(daysAgo(i));
      checkins.push({ habitId: 'k', day }, { habitId: 'o', day }, { habitId: 'p', day });
    }
    // 8 days without it: almost nothing else happens.
    for (let i = 10; i < 18; i++) checkins.push({ habitId: 'o', day: dayKey(daysAgo(i)) });

    const found = buildInsights(base({ habits, checkins } as any)).find((i) => i.id === 'keystone');
    expect(found).toBeDefined();
    expect(found!.title).toContain('Morning run');
  });

  it('stays silent when every habit behaves the same', () => {
    const habits = [
      { id: 'a', name: 'A', days: '1111111', archived: false, paused: false, locked: false },
      { id: 'b', name: 'B', days: '1111111', archived: false, paused: false, locked: false },
    ];
    const checkins: { habitId: string; day: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const day = dayKey(daysAgo(i));
      checkins.push({ habitId: 'a', day }, { habitId: 'b', day });
    }
    expect(ids(base({ habits, checkins } as any))).not.toContain('keystone');
  });

  it('needs more than a handful of days before claiming a pattern', () => {
    const habits = [
      { id: 'a', name: 'A', days: '1111111', archived: false, paused: false, locked: false },
      { id: 'b', name: 'B', days: '1111111', archived: false, paused: false, locked: false },
    ];
    const checkins = [
      { habitId: 'a', day: dayKey(daysAgo(1)) },
      { habitId: 'b', day: dayKey(daysAgo(1)) },
    ];
    expect(ids(base({ habits, checkins } as any))).not.toContain('keystone');
  });
});

describe('bedtime consistency', () => {
  const night = (i: number, bedH: number, quality: number) => ({ id: String(i), ts: daysAgo(i), hours: 7.5, quality, bedH, wakeH: 7 });

  it('reports the quality gap between a steady and a drifting bedtime', () => {
    // Realistic shape: mostly a routine, occasionally blown. The insight is
    // "deviation from your usual", so a usual has to exist.
    const nights = [
      ...Array.from({ length: 12 }, (_, i) => night(i, 23, 9)),     // the routine
      ...Array.from({ length: 5 }, (_, i) => night(i + 20, 2, 5)),  // late nights
    ];
    const found = buildInsights(base({ nights } as any)).find((i) => i.id === 'bedtime-consistency');
    expect(found).toBeDefined();
    expect(found!.detail).toContain('/10');
  });

  it('says nothing when there is no usual bedtime to deviate from', () => {
    // An even split between two schedules has no centre, so claiming one is
    // "usual" would be inventing a pattern rather than finding one.
    const nights = [
      ...Array.from({ length: 8 }, (_, i) => night(i, 23, 9)),
      ...Array.from({ length: 8 }, (_, i) => night(i + 10, 2, 5)),
    ];
    expect(ids(base({ nights } as any))).not.toContain('bedtime-consistency');
  });

  it('treats times either side of midnight as close together', () => {
    // 23:30 and 00:30 are an hour apart, not 23 — so this is a steady schedule
    // with no erratic group, and nothing should be claimed.
    const nights = Array.from({ length: 14 }, (_, i) => night(i, i % 2 ? 23.5 : 0.5, 8));
    expect(ids(base({ nights } as any))).not.toContain('bedtime-consistency');
  });

  it('says nothing without enough nights', () => {
    const nights = [night(0, 23, 9), night(1, 3, 4)];
    expect(ids(base({ nights } as any))).not.toContain('bedtime-consistency');
  });
});

describe('momentum', () => {
  const w = (i: number) => ({ id: String(i), ts: daysAgo(i), dur: 30, catId: null, name: 'W' });

  it('reports a real month-over-month jump', () => {
    const workouts = [
      ...Array.from({ length: 12 }, (_, i) => w(i + 1)),   // this month
      ...Array.from({ length: 4 }, (_, i) => w(i + 35)),   // the month before
    ];
    const found = buildInsights(base({ workouts } as any)).find((i) => i.id === 'momentum');
    expect(found).toBeDefined();
    expect(found!.title).toContain('up');
  });

  it('ignores a change too small to mean anything', () => {
    const workouts = [
      ...Array.from({ length: 10 }, (_, i) => w(i + 1)),
      ...Array.from({ length: 10 }, (_, i) => w(i + 35)),
    ];
    expect(ids(base({ workouts } as any))).not.toContain('momentum');
  });

  it('treats falling spending as an improvement, not an alarm', () => {
    const txn = (i: number, amt: number) => ({ id: String(i), ts: daysAgo(i), amount: amt, cat: 'Food', name: 'x', income: false });
    const txns = [
      ...Array.from({ length: 5 }, (_, i) => txn(i + 1, -20)),   // 100 this month
      ...Array.from({ length: 5 }, (_, i) => txn(i + 35, -60)),  // 300 before
    ];
    const found = buildInsights(base({ txns } as any)).find((i) => i.id === 'momentum');
    expect(found).toBeDefined();
    expect(found!.color).toBe('success');
  });
});

describe('widget summary', () => {
  const habit = (id: string) => ({ id, name: id, days: '1111111', archived: false, paused: false, locked: false });

  it('counts only habits scheduled for today', () => {
    const s = base({ habits: [habit('a'), habit('b')], checkins: [{ habitId: 'a', day: dayKey() }] } as any);
    expect(summarise(s)).toBe('1/2 habits');
  });

  it('celebrates a finished day', () => {
    const s = base({ habits: [habit('a')], checkins: [{ habitId: 'a', day: dayKey() }] } as any);
    expect(summarise(s)).toBe('All 1 done');
  });

  it('ignores paused and archived habits', () => {
    const s = base({ habits: [habit('a'), { ...habit('b'), paused: true }, { ...habit('c'), archived: true }] } as any);
    expect(summarise(s)).toBe('0/1 habits');
  });

  it('falls back to a call to action with nothing due', () => {
    expect(summarise(base())).toBe('Tap to log');
  });

  it('stays short enough for the widget to render', () => {
    const many = Array.from({ length: 40 }, (_, i) => habit('h' + i));
    expect(summarise(base({ habits: many } as any)).length).toBeLessThanOrEqual(40);
  });
});

describe('deep links', () => {
  it('routes each shortcut and widget action', () => {
    expect(parseShortcut('orbit://log/workout')).toBe('workout');
    expect(parseShortcut('orbit://log/sleep')).toBe('sleep');
    expect(parseShortcut('orbit://log/expense')).toBe('expense');
  });

  it('lets a plain open fall through to the normal launch', () => {
    expect(parseShortcut('orbit://open')).toBeNull();
    expect(parseShortcut(null)).toBeNull();
    expect(parseShortcut('https://example.com')).toBeNull();
  });
});


// Analytics widgets deep-link to the screen they summarise. Bare orbit://open
// stays screen-less on purpose: the summary widget means "just open the app".
describe('widget deep links', () => {
  it('routes each module widget to its screen', () => {
    expect(parseScreen('orbit://open/finances')).toBe('finances');
    expect(parseScreen('orbit://open/habits')).toBe('habits');
    expect(parseScreen('orbit://open/workouts')).toBe('workouts');
    expect(parseScreen('orbit://open/sleep')).toBe('sleep');
  });

  it('treats a bare open, and anything unknown, as no screen', () => {
    expect(parseScreen('orbit://open')).toBeNull();
    expect(parseScreen('orbit://open/nonsense')).toBeNull();
    expect(parseScreen('https://example.com/open/habits')).toBeNull();
    expect(parseScreen(null)).toBeNull();
  });

  it('keeps logging links and screen links apart', () => {
    // 'sleep' names both a log sheet and a screen; the prefix decides which.
    expect(parseTarget('orbit://log/sleep')).toEqual({ kind: 'log', action: 'sleep' });
    expect(parseTarget('orbit://open/sleep')).toEqual({ kind: 'screen', screen: 'sleep' });
    expect(parseTarget('orbit://open')).toBeNull();
  });
});
