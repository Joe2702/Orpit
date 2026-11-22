import { describe, it, expect } from 'vitest';
import { derive } from '../lib/derive';
import type { AppState, Archive, Txn } from '../types';

// An entry dated after the month it's in (a bill logged ahead, a payment typed
// with the wrong year) used to land in this month's "spent": a January 2027
// expense of 1,000 put November 2026's dashboard up by 1,000. Each month is
// closed at both ends now, and a balance counts only what has happened.

const D = 86_400_000;
const now = new Date(2026, 10, 18, 15).getTime(); // 18 November 2026
const archive: Archive = { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400 };
const txn = (id: string, amount: number, ts: number, extra: Partial<Txn> = {}): Txn =>
  ({ id, name: 'Thing', cat: 'Food', amount, income: amount > 0, accId: 'a', toAccId: null, adjust: false, note: null, photo: false, ts, ...extra }) as Txn;
const state = (txns: Txn[]): AppState =>
  ({
    profile: { createdAt: 0 },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns,
    accounts: [{ id: 'a', name: 'Bank', type: 'Bank', color: 'blue', opening: 5000 }],
    fcats: [], budgets: [{ id: 'b', cat: 'Food', limit: 3000, rollover: false }], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [], archive,
  }) as unknown as AppState;

describe('money is counted in the month it belongs to', () => {
  const nov = [txn('1', -300, now - 2 * D), txn('2', -700, now - D), txn('3', 9000, now - 3 * D, { cat: 'Salary' })];
  const january = txn('4', -1000, new Date(2027, 0, 10).getTime());
  const nextMonthPay = txn('5', 4000, new Date(2026, 11, 1, 9).getTime(), { cat: 'Salary' });

  it('a January expense doesn’t change November’s spending, income, categories or budget', () => {
    const before = derive(state(nov), 'Month', 0, now);
    const after = derive(state([...nov, january, nextMonthPay]), 'Month', 0, now);
    expect(after.spentThisMonth).toBe(1000);
    expect(after.spentThisMonth).toBe(before.spentThisMonth);
    expect(after.incThisMonth).toBe(9000);
    expect(after.incThisMonth).toBe(before.incThisMonth);
    expect(after.budgets[0].spent).toBe(1000);
    expect(after.topCatArr).toEqual(before.topCatArr);
  });

  it('a balance counts what has happened up to today, and the net worth line ends on it', () => {
    const later = txn('6', -250, now + 3 * D);
    const today = txn('7', -50, new Date(2026, 10, 18, 22).getTime()); // later today
    const d = derive(state([...nov, january, later, today]), 'Month', 0, now);
    expect(d.accounts[0].balance).toBe(5000 - 300 - 700 + 9000 - 50);
    expect(d.netWorth).toBe(d.accounts[0].balance);
    expect(d.netWorthSeries[d.netWorthSeries.length - 1]).toBe(d.netWorth);
  });
});
