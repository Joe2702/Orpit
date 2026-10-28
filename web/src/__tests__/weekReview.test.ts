import { describe, it, expect } from 'vitest';
import { summariseWeek, reviewWindow } from '../lib/weekReview';
import { dayKey } from '../lib/format';
import type { AppState, Txn } from '../types';

const DAY = 86_400_000;
const SUN = new Date(2026, 9, 25, 19).getTime(); // Sunday evening

describe('week review', () => {
  it('sums the last seven days against the seven before, with top places', () => {
    const t = (name: string, amount: number, daysAgo: number, cat = 'Food') =>
      ({ id: name + daysAgo, name, cat, amount, income: amount > 0, accId: null, toAccId: null, adjust: false, note: null, photo: false, ts: SUN - daysAgo * DAY }) as Txn;
    const s = {
      txns: [t('Talabat', -300, 1), t('Talabat', -200, 3), t('Carrefour', -900, 2, 'Groceries'), t('Old', -1000, 9), t('Salary', 30000, 2, 'Salary')],
      habits: [{ id: 'h', name: 'Read', days: '1111111', archived: false, paused: false, locked: false }],
      checkins: [0, 1, 2, 3].map((n) => ({ habitId: 'h', day: dayKey(SUN - n * DAY) })),
      workouts: [{ ts: SUN - DAY }],
      nights: [{ ts: SUN - DAY, hours: 7 }, { ts: SUN - 2 * DAY, hours: 8 }],
    } as unknown as AppState;
    const w = summariseWeek(s, SUN);
    expect(w.spent).toBe(1400);
    expect(w.spentBefore).toBe(1000);
    expect(w.topPlaces.map((p) => p.name)).toEqual(['Carrefour', 'Talabat']);
    expect(w.topCat).toBe('Groceries');
    expect([w.habitDone, w.habitPlanned]).toEqual([4, 7]);
    expect(w.weakestHabit).toBe('Read');
    expect(w.workouts).toBe(1);
    expect(w.avgSleep).toBe(7.5);
  });

  it('is offered from Saturday noon to the end of Monday', () => {
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
    expect(reviewWindow(at(24, 10))).toBeNull(); // Saturday morning
    expect(reviewWindow(at(24, 15))).toBe('2026-10-24');
    expect(reviewWindow(at(25, 19))).toBe('2026-10-24');
    expect(reviewWindow(at(26, 22))).toBe('2026-10-24'); // Monday
    expect(reviewWindow(at(27, 9))).toBeNull(); // Tuesday
  });
});
