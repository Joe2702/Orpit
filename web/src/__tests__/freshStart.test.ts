import { describe, it, expect } from 'vitest';
import { freshStart } from '../lib/freshStart';
import type { AppState } from '../types';

const at = (iso: string) => new Date(iso).getTime();

const workout = (iso: string) => ({
  id: iso, name: 'W', catId: null, dur: 45, dist: null, kcal: null, intensity: null, note: null, sets: null, ts: at(iso),
});

const state = (over: Partial<AppState> = {}): AppState =>
  ({
    profile: { createdAt: at('2026-01-01T00:00:00'), currency: 'EGP' },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [], milestones: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400 },
    ...over,
  }) as unknown as AppState;

describe('the fresh-start card', () => {
  const lastWeek = state({ workouts: [workout('2026-10-13T18:00:00'), workout('2026-10-15T18:00:00')] as any });

  it('appears at the start of a week, summarising the one before', () => {
    const f = freshStart(lastWeek, at('2026-10-18T09:00:00')); // Sunday
    expect(f?.kind).toBe('week');
    expect(f?.body).toContain('2 workouts');
  });

  it('stays away in the middle of the week', () => {
    expect(freshStart(lastWeek, at('2026-10-22T09:00:00'))).toBeNull(); // Thursday
  });

  it('prefers the month over the week when both land together', () => {
    const s = state({ workouts: [workout('2026-10-10T18:00:00')] as any });
    const f = freshStart(s, at('2026-11-01T09:00:00')); // a Sunday and the 1st
    expect(f?.kind).toBe('month');
    expect(f?.title).toBe('Welcome to November');
    expect(f?.cta).toContain('October');
  });

  it('says nothing to an account with nothing to look back on', () => {
    expect(freshStart(state(), at('2026-10-18T09:00:00'))).toBeNull();
  });

  it('keys each period separately, so dismissing one week does not hide the next', () => {
    const a = freshStart(lastWeek, at('2026-10-18T09:00:00'));
    const s2 = state({ workouts: [workout('2026-10-20T18:00:00')] as any });
    const b = freshStart(s2, at('2026-10-25T09:00:00'));
    expect(a?.key).not.toBe(b?.key);
  });
});
