import type { Recurring } from '../types';

// "Can I afford this?" as one number.
//
// Balances answer what's there, budgets answer how each category is doing,
// and neither answers the question people actually open a money app with. This
// does: what's left for the rest of the month once the bills still to come are
// set aside, and what that is per day.
//
// Two ways to work it out, in order of how much they know:
//   income: this month's income (what's arrived, or the salary that's expected
//           if it hasn't yet) minus what's been spent and the bills still due;
//   budget: the month's budgets minus what's been spent in them.
// With neither, there's no honest number to show, and none is shown.

export interface SafeToSpend {
  /** Can be negative: already past what the month allows. */
  left: number;
  perDay: number;
  daysLeft: number;
  /** Bills still due this month, already taken off `left`. */
  billsLeft: number;
  basis: 'income' | 'budget';
}

const DAY = 86_400_000;

export function safeToSpend(
  o: {
    incomeThisMonth: number;
    expectedMonthlyIncome: number;
    spentThisMonth: number;
    budgetTotal: number;
    budgetSpent: number;
    recurring: Recurring[];
  },
  now: number = Date.now()
): SafeToSpend | null {
  const d = new Date(now);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const daysLeft = Math.max(1, Math.round((monthEnd - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY));

  // Every expense still due before the month ends, counting each weekly one
  // as many times as it will come round.
  let billsLeft = 0;
  for (const r of o.recurring) {
    if (r.income || !r.nextTs) continue;
    const step = r.freq === 'Weekly' ? 7 * DAY : 0;
    for (let t = Math.max(r.nextTs, now - DAY); t < monthEnd; t = step ? t + step : monthEnd) {
      if (t >= now - DAY) billsLeft += Math.abs(r.amount);
      if (!step) break;
    }
  }

  const income = Math.max(o.incomeThisMonth, o.expectedMonthlyIncome);
  let left: number;
  let basis: SafeToSpend['basis'];
  if (income > 0) {
    left = income - o.spentThisMonth - billsLeft;
    basis = 'income';
  } else if (o.budgetTotal > 0) {
    left = o.budgetTotal - o.budgetSpent;
    basis = 'budget';
  } else return null;
  left = Math.round(left);
  return { left, perDay: Math.round(left / daysLeft), daysLeft, billsLeft: Math.round(billsLeft), basis };
}
