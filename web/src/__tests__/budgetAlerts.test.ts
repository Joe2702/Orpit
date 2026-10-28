import { describe, it, expect } from 'vitest';
import { budgetAlerts, type BudgetForAlert } from '../lib/budgetAlerts';

const NOW = new Date(2026, 9, 12, 12).getTime(); // 12 October
const b = (over: Partial<BudgetForAlert>): BudgetForAlert => ({
  id: 'b1',
  cat: 'Groceries',
  spent: 0,
  pct: 0,
  effLimit: 7000,
  projected: null,
  willExceed: false,
  ...over,
});

describe('budget alerts', () => {
  it('says nothing for a budget on track', () => {
    expect(budgetAlerts([b({ spent: 2000, pct: 29 })], NOW, new Set())).toEqual([]);
  });

  it('warns at 80%, with what is left per day', () => {
    const [a] = budgetAlerts([b({ spent: 5800, pct: 83 })], NOW, new Set());
    expect(a.title).toBe('Groceries: 83% used');
    expect(a.body).toContain('a day');
    expect(a.key).toBe('b1:2026-10:80');
  });

  it('says "over" once, and that settles the lower levels too', () => {
    const [a] = budgetAlerts([b({ spent: 7700, pct: 110 })], NOW, new Set());
    expect(a.title).toBe('Over your Groceries budget');
    expect(a.settles).toEqual(['b1:2026-10:100', 'b1:2026-10:80', 'b1:2026-10:pace']);
    expect(budgetAlerts([b({ spent: 7900, pct: 113 })], NOW, new Set(a.settles))).toEqual([]);
  });

  it('warns about pace only once there is enough month to judge it', () => {
    const fast = b({ spent: 3500, pct: 50, willExceed: true, projected: 9000 });
    expect(budgetAlerts([fast], NOW, new Set())[0].title).toBe('Groceries is running fast');
    expect(budgetAlerts([fast], new Date(2026, 9, 3).getTime(), new Set())).toEqual([]);
  });

  it('starts again next month', () => {
    const sent = new Set(['b1:2026-10:80']);
    const nov = new Date(2026, 10, 20).getTime();
    expect(budgetAlerts([b({ spent: 5800, pct: 83 })], nov, sent)).toHaveLength(1);
  });

  it('never sends more than two at once, the most urgent first', () => {
    const many = [
      b({ id: 'a', cat: 'A', pct: 85, spent: 5950 }),
      b({ id: 'b', cat: 'B', pct: 120, spent: 8400 }),
      b({ id: 'c', cat: 'C', pct: 90, spent: 6300 }),
    ];
    const out = budgetAlerts(many, NOW, new Set());
    expect(out.map((a) => a.title)).toEqual(['Over your B budget', 'A: 85% used']);
  });
});
