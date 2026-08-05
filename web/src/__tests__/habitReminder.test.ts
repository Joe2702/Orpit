import { describe, it, expect } from 'vitest';
import { deriveHabits } from '../lib/derive';
import type { AppState } from '../types';

// A habit's own reminder time has to survive a round trip through the edit
// sheet. It didn't: the Habits screen opened the sheet without passing
// `reminderTime`, so the field initialised empty and saving wrote null back.
// Setting a reminder and later renaming the habit silently deleted it — a
// failure with no error, no toast, and no symptom until the notification that
// was supposed to arrive didn't.
//
// The sheet reads its initial value from the derived habit, so that carrying
// the field is what this pins.

const habit = (over: Record<string, unknown> = {}) => ({
  id: 'h1', name: 'Read', color: 'teal', target: 'Every day', locked: false,
  days: '1111111', paused: false, archived: false, why: null, reminderTime: null,
  ...over,
});

const state = (habits: unknown[]): AppState =>
  ({
    profile: { createdAt: Date.now() },
    habits, checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {} },
  }) as unknown as AppState;

describe("a habit's own reminder", () => {
  it('reaches the screen that opens the edit sheet', () => {
    const h = deriveHabits(state([habit({ reminderTime: '07:30' })]), 'Week');
    expect(h.habits[0].reminderTime).toBe('07:30');
  });

  it('stays null when none is set, rather than becoming undefined', () => {
    // undefined would read as "field absent" and take the same path that
    // wiped it — null is the explicit "no reminder".
    const h = deriveHabits(state([habit()]), 'Week');
    expect(h.habits[0].reminderTime).toBeNull();
  });

  it('is carried for every habit, not just the first', () => {
    const h = deriveHabits(
      state([habit({ id: 'a', reminderTime: '06:00' }), habit({ id: 'b', name: 'Walk', reminderTime: '21:15' })]),
      'Week'
    );
    expect(h.habits.map((x) => x.reminderTime)).toEqual(['06:00', '21:15']);
  });
});
