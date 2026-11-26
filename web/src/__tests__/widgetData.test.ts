import { describe, it, expect } from 'vitest';
import { buildWidgetData, hm } from '../lib/widgetData';
import { dayKey } from '../lib/format';
import type { AppState } from '../types';

// What the home-screen widgets draw. The native side only places these values,
// so the contract has to hold here: every habit with its days (the widget picks
// today's itself, so a new day starts clean), seven points in every chart,
// and nothing "today" claimed for another day.

const D = 86_400_000;
const now = new Date(2026, 10, 25, 20).getTime(); // a Wednesday evening

const habit = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: 'Habit ' + id, color: 'teal', target: '', locked: false, days: '1111111',
  paused: false, archived: false, why: null, reminderTime: null, ...over,
});
const state = (over: Record<string, unknown> = {}): AppState =>
  ({
    profile: { createdAt: now - 100 * D, currency: 'EGP' },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [], steps: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {} },
    ...over,
  }) as unknown as AppState;

describe('the widgets’ data', () => {
  it('lists every live habit with its days and whether it’s done today', () => {
    const w = buildWidgetData(
      state({
        habits: [habit('a'), habit('b', { days: '0000010' }), habit('c', { paused: true }), habit('d', { archived: true })],
        checkins: [{ habitId: 'a', day: dayKey(now) }, { habitId: 'b', day: dayKey(now - D) }],
      }),
      now
    );
    expect(w.day).toBe(dayKey(now));
    expect(w.habits.list.map((h) => [h.name, h.days, h.done])).toEqual([
      ['Habit a', '1111111', true],
      ['Habit b', '0000010', false],
    ]);
  });

  it('has steps only when there is a Steps habit, with its goal', () => {
    expect(buildWidgetData(state(), now).steps).toBeNull();
    const w = buildWidgetData(
      state({ habits: [habit('s', { name: 'Steps', auto: 'steps', goal: 7500 })], steps: [{ day: dayKey(now), count: 5230, source: null }] }),
      now
    );
    expect(w.steps).toEqual({ count: 5230, goal: 7500, goalText: 'of 7,500' });
  });

  it('draws seven days in every chart, oldest first, with last night when it’s logged', () => {
    const lastNight = { id: 'n', hours: 7.7, quality: 8, bedH: 23.5, wakeH: 7.2, note: null, ts: new Date(2026, 10, 25, 7).getTime() };
    const older = { ...lastNight, id: 'o', hours: 6, ts: new Date(2026, 10, 21, 7).getTime() };
    const run = { id: 'w', name: 'Run', catId: null, dur: 42, dist: null, kcal: null, intensity: null, note: null, ts: new Date(2026, 10, 24, 18).getTime() };
    const w = buildWidgetData(state({ nights: [lastNight, older], workouts: [run] }), now);
    expect(w.sleep.series).toEqual([0, 0, 6, 0, 0, 0, 7.7]);
    expect(w.sleep.labels).toHaveLength(7);
    expect(w.sleep.last).toBe('7h 42m');
    expect(w.sleep.quality).toBe('8/10 quality');
    expect(w.training.series).toEqual([0, 0, 0, 0, 0, 42, 0]);
  });

  it('says nothing about last night when it isn’t logged', () => {
    const w = buildWidgetData(state(), now);
    expect(w.sleep.last).toBeNull();
    expect(w.sleep.series).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('puts this month’s spending against the budget', () => {
    const t1 = { id: 't', name: 'Groceries', cat: 'Food', amount: -600, income: false, accId: null, toAccId: null, adjust: false, note: null, photo: false, ts: now - D };
    const w = buildWidgetData(state({ txns: [t1], budgets: [{ id: 'b', cat: 'Food', limit: 2000, rollover: false }] }), now);
    expect(w.money.budgetPct).toBe(30);
    expect(w.money.budgetText).toBe('30% of your budget');
    expect(buildWidgetData(state({ txns: [t1] }), now).money.budgetPct).toBeNull();
  });

  it('carries the words the widget fills in, with the placeholders it expects', () => {
    const w = buildWidgetData(state(), now);
    expect(w.t.doneOf).toContain('{done}');
    expect(w.t.doneOf).toContain('{due}');
    expect(w.t.toGo).toContain('{n}');
    for (const v of Object.values(w.t)) expect(v.length).toBeGreaterThan(0);
  });

  it('reads hours the way a person says them', () => {
    expect(hm(7.7)).toBe('7h 42m');
    expect(hm(8)).toBe('8h');
    expect(hm(7.999)).toBe('8h');
    expect(hm(0)).toBe('—');
  });
});
