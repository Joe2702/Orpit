import { describe, it, expect } from 'vitest';
import { dayCompleteLine } from '../lib/dayComplete';
import { dayKey } from '../lib/format';
import type { AppState, Habit } from '../types';

const NOW = new Date(2026, 10, 10, 20).getTime(); // a Tuesday evening
const ago = (n: number) => dayKey(NOW - n * 86_400_000);
const habit = (id: string, name: string, days = '1111111'): Habit => ({ id, name, color: 'indigo', target: '', locked: false, days, paused: false, archived: false, why: null, reminderTime: null });
const state = (habits: Habit[], checkins: [string, number][]) =>
  ({ habits, checkins: checkins.map(([habitId, n]) => ({ habitId, day: ago(n) })) }) as unknown as AppState;
const daysDone = (id: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => [id, from + i] as [string, number]);

describe('the line when the day is done', () => {
  it('names a round number reached today', () => {
    // 21 days of reading, today included.
    const s = state([habit('r', 'Read')], daysDone('r', 0, 20));
    const line = dayCompleteLine(s, NOW);
    expect(line.kind).toBe('milestone');
    expect(line.text).toBe('Read: 21 days and counting.');
  });

  it('marks 66 days as the point a habit runs itself', () => {
    const s = state([habit('r', 'Read')], daysDone('r', 0, 65));
    expect(dayCompleteLine(s, NOW).text).toBe('Read: 66 days. About when a habit starts to run itself.');
  });

  it('counts days in a row with every habit done', () => {
    // Two habits, both done the last 4 days; the day before, Walk (kept since
    // day 10) was missed.
    const s = state([habit('a', 'Stretch'), habit('b', 'Walk')], [...daysDone('a', 0, 5), ...daysDone('b', 0, 3), ['b', 10]]);
    const line = dayCompleteLine(s, NOW);
    expect(line).toEqual({ kind: 'run', text: 'Every habit done, 4 days running.' });
  });

  it('skips days with nothing scheduled instead of breaking the run', () => {
    // Weekdays only (Mon–Fri). NOW is Tuesday: Tue, Mon done, weekend off, Fri done, Thu missed.
    const s = state([habit('w', 'Gym', '0111110')], [['w', 0], ['w', 1], ['w', 4], ['w', 6], ['w', 30]]);
    expect(dayCompleteLine(s, NOW).text).toBe('Every habit done, 3 days running.');
  });

  it('does not count a new habit as missed before it existed', () => {
    // "Walk" started yesterday; "Read" has gone 5 days. The run is 5, not 2.
    const s = state([habit('r', 'Read'), habit('w', 'Walk')], [...daysDone('r', 0, 4), ...daysDone('w', 0, 1)]);
    expect(dayCompleteLine(s, NOW).text).toBe('Every habit done, 5 days running.');
  });

  it('says a long-kept habit is second nature', () => {
    // 80 days of reading in the past, but yesterday was missed: no run, no milestone.
    const s = state([habit('r', 'Read')], [...daysDone('r', 0, 0), ...daysDone('r', 2, 80)]);
    expect(dayCompleteLine(s, NOW)).toEqual({ kind: 'formed', text: 'Read is second nature now, 80 days in.' });
  });

  it('falls back to something plainly true', () => {
    const s = state([habit('r', 'Read')], [['r', 0], ['r', 3]]);
    expect(dayCompleteLine(s, NOW)).toEqual({ kind: 'kept', text: 'You did what you said you would.' });
  });

  it('talks about the habits the person chose, not the app\'s own', () => {
    const own = { ...habit('c', 'Daily Check-In'), locked: true };
    // 300 check-ins on the built-in habit, 80 on reading; yesterday was missed.
    const s = state([own, habit('r', 'Read')], [...daysDone('c', 0, 299), ['r', 0], ...daysDone('r', 2, 80)]);
    expect(dayCompleteLine(s, NOW).text).toBe('Read is second nature now, 80 days in.');
  });

  it('ignores paused and archived habits', () => {
    const paused = { ...habit('p', 'Paused'), paused: true };
    const s = state([habit('r', 'Read'), paused], [...daysDone('r', 0, 2)]);
    expect(dayCompleteLine(s, NOW).text).toBe('Every habit done, 3 days running.');
  });

  it('takes turns when more than one line is true, the same all day', () => {
    const s = state([habit('r', 'Read')], [...daysDone('r', 0, 69)]); // 70 days in a row: run and formed
    const kinds = new Set([0, 1, 2, 3].map((d) => dayCompleteLine(s, NOW + d * 86_400_000).kind));
    expect(kinds.size).toBeGreaterThan(1);
    expect(dayCompleteLine(s, NOW).kind).toBe(dayCompleteLine(s, NOW - 3 * 3_600_000).kind);
  });
});
