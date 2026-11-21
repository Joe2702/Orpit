import { describe, it, expect } from 'vitest';
import { deriveHabits, habitFrom } from '../lib/derive';
import { dayKey } from '../lib/format';
import { addDays, startOfDay, startOfWeek } from '../lib/period';
import type { AppState } from '../types';

// Adding a habit used to count it as missed on every day before it existed,
// so a new habit (or Steps, which Orpit adds for everyone) could break a
// weekly streak someone had fairly earned.

const habit = (over: Record<string, unknown> = {}) => ({
  id: 'h1', name: 'Read', color: 'teal', target: 'Daily', locked: false,
  days: '1111111', paused: false, archived: false, why: null, reminderTime: null,
  ...over,
});
const state = (habits: unknown[], checkins: { habitId: string; day: string }[]): AppState =>
  ({
    profile: { createdAt: 0 },
    habits, checkins, wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {} },
  }) as unknown as AppState;

describe('a habit is scored from the day it was added', () => {
  // A Wednesday, so this week already has days behind it.
  const now = new Date(2026, 10, 18, 12).getTime();
  const today = startOfDay(now);
  const lastWeek = addDays(startOfWeek(now), -7);
  const everyDay = (habitId: string, from: number, n: number) => Array.from({ length: n }, (_, i) => ({ habitId, day: dayKey(addDays(from, i)) }));

  it('adding one today doesn’t break last week’s streak', () => {
    const read = habit({ id: 'read', since: '2026-01-01' });
    const steps = habit({ id: 'steps', name: 'Steps', auto: 'steps', goal: 8000, since: dayKey(today) });
    const checkins = everyDay('read', lastWeek, 7);
    expect(deriveHabits(state([read], checkins), 'Week', 0, now).weekStreak).toBe(1);
    expect(deriveHabits(state([read, steps], checkins), 'Week', 0, now).weekStreak).toBe(1);
  });

  it('counts a day filled in before it was added', () => {
    expect(habitFrom({ since: '2026-11-18' }, ['2026-11-15', '2026-11-20'])).toBe(new Date(2026, 10, 15).getTime());
    expect(habitFrom({ since: '2026-11-18' }, [])).toBe(new Date(2026, 10, 18).getTime());
  });

  it('leaves habits from before habits were dated as they were', () => {
    expect(habitFrom({}, ['2026-01-01'])).toBeNull();
  });
});
