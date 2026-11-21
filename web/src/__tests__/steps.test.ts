import { describe, it, expect } from 'vitest';
import { lastDays, milestoneOf, stepsHabit, stepsOn } from '../lib/steps';
import { parseTarget } from '../lib/shortcuts';
import type { AppState } from '../types';

const state = (over: Partial<AppState>): AppState => ({ habits: [], checkins: [], steps: [], ...over }) as unknown as AppState;

describe('step notifications', () => {
  it('fire at each quarter of the goal, and at the goal', () => {
    expect(milestoneOf(0, 8000)).toBe(0);
    expect(milestoneOf(1999, 8000)).toBe(0);
    expect(milestoneOf(2000, 8000)).toBe(25);
    expect(milestoneOf(4000, 8000)).toBe(50);
    expect(milestoneOf(5999, 8000)).toBe(50);
    expect(milestoneOf(6000, 8000)).toBe(75);
    expect(milestoneOf(8000, 8000)).toBe(100);
    expect(milestoneOf(23000, 8000)).toBe(100);
  });

  it('never fire without a goal', () => {
    expect(milestoneOf(9000, 0)).toBe(0);
  });

  it('open today’s steps when tapped', () => {
    expect(parseTarget('orbit://open/steps')).toEqual({ kind: 'steps' });
    expect(parseTarget('orbit://open/finances')).toEqual({ kind: 'screen', screen: 'finances' });
  });
});

describe('steps in the app', () => {
  it('finds the Steps habit, but not one that was archived', () => {
    const h = { id: '9', name: 'Steps', auto: 'steps', goal: 8000, archived: false };
    expect(stepsHabit(state({ habits: [h] as never }))?.id).toBe('9');
    expect(stepsHabit(state({ habits: [{ ...h, archived: true }] as never }))).toBeUndefined();
    expect(stepsHabit(state({ habits: [{ ...h, auto: null }] as never }))).toBeUndefined();
  });

  it('lays out the last seven days oldest first, with nothing counted as zero', () => {
    const now = new Date(2026, 10, 18, 15).getTime();
    const s = state({ steps: [{ day: '2026-11-18', count: 5230, source: 'Samsung Health' }, { day: '2026-11-15', count: 9100, source: null }] });
    const week = lastDays(s, 7, now);
    expect(week.map((d) => d.day)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(week.map((d) => d.count)).toEqual([0, 0, 0, 9100, 0, 0, 5230]);
    expect(stepsOn(s, '2026-11-18')?.source).toBe('Samsung Health');
    expect(stepsOn(state({ steps: undefined }), '2026-11-18')).toBeUndefined();
  });
});
