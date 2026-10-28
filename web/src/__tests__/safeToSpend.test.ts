import { describe, it, expect } from 'vitest';
import { safeToSpend } from '../lib/safeToSpend';
import type { Recurring } from '../types';

const NOW = new Date(2026, 9, 21, 12).getTime(); // 21 October: 11 days left
const DAY = 86_400_000;
const r = (amount: number, daysAhead: number, extra: Partial<Recurring> = {}): Recurring =>
  ({ id: String(amount), name: 'x', cat: 'Bills', accId: null, amount, freq: 'Monthly', income: false, nextTs: NOW + daysAhead * DAY, ...extra }) as Recurring;
const base = { incomeThisMonth: 0, expectedMonthlyIncome: 0, spentThisMonth: 0, budgetTotal: 0, budgetSpent: 0, recurring: [] as Recurring[] };

describe('safe to spend', () => {
  it('is income minus spending minus the bills still to come, per day left', () => {
    const s = safeToSpend({ ...base, incomeThisMonth: 32000, spentThisMonth: 14000, recurring: [r(9500, 5), r(240, 40)] }, NOW)!;
    expect(s.billsLeft).toBe(9500);
    expect(s.left).toBe(32000 - 14000 - 9500);
    expect(s.daysLeft).toBe(11);
    expect(s.perDay).toBe(Math.round(8500 / 11));
    expect(s.basis).toBe('income');
  });

  it('uses the expected salary before it arrives', () => {
    const s = safeToSpend({ ...base, expectedMonthlyIncome: 30000, spentThisMonth: 5000 }, NOW)!;
    expect(s.left).toBe(25000);
  });

  it('counts a weekly bill every time it comes round this month', () => {
    const s = safeToSpend({ ...base, incomeThisMonth: 10000, recurring: [r(100, 1, { freq: 'Weekly' })] }, NOW)!;
    expect(s.billsLeft).toBe(200); // 22nd and 29th
  });

  it('falls back to budgets, and to nothing', () => {
    expect(safeToSpend({ ...base, budgetTotal: 12000, budgetSpent: 9000 }, NOW)).toMatchObject({ left: 3000, basis: 'budget' });
    expect(safeToSpend(base, NOW)).toBeNull();
  });

  it('can be negative', () => {
    expect(safeToSpend({ ...base, incomeThisMonth: 5000, spentThisMonth: 7000 }, NOW)!.left).toBe(-2000);
  });
});
