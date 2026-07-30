import { describe, it, expect } from 'vitest';
import { metrics as computeMetrics } from '../lib/badges';
import type { AppState, Archive } from '../types';

// The client now receives only a rolling window of raw history, with everything
// older folded into `archive` totals. These guard the consequence: all-time
// numbers must not shrink when old rows age out of the window. A badge earned
// in year one un-earning itself would be the worst kind of regression.

const emptyArchive: Archive = {
  workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0,
  txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400,
};

function state(over: Partial<AppState> = {}, archive: Partial<Archive> = {}): AppState {
  return {
    profile: { avatar: null, createdAt: Date.now() - 86400000 * 10 },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { ...emptyArchive, ...archive },
    ...over,
  } as unknown as AppState;
}

const w = (ts: number) => ({ id: String(ts), ts }) as any;

describe('badge metrics across the window boundary', () => {
  it('counts window + archive, not just the window', () => {
    const m = computeMetrics(state({ workouts: [w(1), w(2)] }, { workouts: 148 }));
    expect(m.workouts).toBe(150);
  });

  it('keeps a badge earned long ago earned, with zero rows in the window', () => {
    // Someone who logged 150 workouts two years ago and nothing since.
    const m = computeMetrics(state({}, { workouts: 150 }));
    expect(m.workouts).toBe(150);
  });

  it('totals every entry type', () => {
    const m = computeMetrics(
      state(
        { workouts: [w(1)], nights: [w(2)], txns: [w(3)], countLogs: [w(4)], checkins: [{ habitId: 'h', day: '2026-01-01' }] as any },
        { workouts: 10, nights: 20, txns: 30, countLogs: 40, checkins: 50 }
      )
    );
    expect(m.entries).toBe(5 + 150);
  });

  it('adds archived active days to windowed ones (the sets are disjoint)', () => {
    const m = computeMetrics(state({ checkins: [{ habitId: 'h', day: '2026-07-01' }] as any }, { activeDays: 200 }));
    expect(m.activeDays).toBe(201);
  });

  it('counts a tracker used only before the window as used', () => {
    const m = computeMetrics(state({}, { workouts: 5, nights: 5, txns: 5 }));
    expect(m.trackers).toBe(3);
  });

  it('reports nothing for a brand-new account', () => {
    const m = computeMetrics(state());
    expect(m.entries).toBe(0);
    expect(m.trackers).toBe(0);
    expect(m.activeDays).toBe(0);
  });
});
