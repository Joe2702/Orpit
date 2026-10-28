import { money0 } from './format';

// When to say something about a budget.
//
// Budgets used to be a screen you had to visit: the warning that this month's
// groceries were heading over sat there until you happened to look, usually
// after it was too late to matter. Alerts that arrive when spending crosses a
// line change behaviour while there's still month left; in field studies,
// overspending messages cut the next day's spending by around 5%.
//
// Three lines per budget per month, each said once: on pace to go over (only
// from the 5th, when there's enough month to judge a pace by), 80% used, and
// over. A higher one replaces the lower ones, so a single big payment that
// jumps from 50% to 110% says "over", not three things at once.

export interface BudgetForAlert {
  id: string;
  cat: string;
  spent: number;
  pct: number;
  effLimit: number;
  projected: number | null;
  willExceed: boolean;
}

export interface BudgetAlert {
  /** Budget, month and level; an alert with a key already sent is never sent again. */
  key: string;
  /** Every key this alert settles, including the lower levels it supersedes. */
  settles: string[];
  title: string;
  body: string;
}

/** At most this many at once: a first launch over several budgets shouldn't be a wall. */
const MAX = 2;

export function budgetAlerts(budgets: BudgetForAlert[], now: number, sent: Set<string>): BudgetAlert[] {
  const d = new Date(now);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - d.getDate() + 1);
  const out: BudgetAlert[] = [];

  for (const b of budgets) {
    if (!(b.effLimit > 0)) continue;
    const k = (level: string) => `${b.id}:${month}:${level}`;
    const keys = { over: k('100'), high: k('80'), pace: k('pace') };
    let alert: BudgetAlert | null = null;
    if (b.pct >= 100) {
      alert = {
        key: keys.over,
        settles: [keys.over, keys.high, keys.pace],
        title: `Over your ${b.cat} budget`,
        body: `${money0(b.spent)} spent of ${money0(b.effLimit)} this month.`,
      };
    } else if (b.pct >= 80) {
      const left = b.effLimit - b.spent;
      alert = {
        key: keys.high,
        settles: [keys.high, keys.pace],
        title: `${b.cat}: ${b.pct}% used`,
        body: `${money0(left)} left for the rest of the month, about ${money0(left / daysLeft)} a day.`,
      };
    } else if (b.willExceed && b.projected != null && d.getDate() >= 5) {
      alert = {
        key: keys.pace,
        settles: [keys.pace],
        title: `${b.cat} is running fast`,
        body: `At this pace it reaches ${money0(b.projected)} by the end of the month, ${money0(b.projected - b.effLimit)} over.`,
      };
    }
    if (alert && !sent.has(alert.key)) out.push(alert);
  }
  // The most urgent first: over, then 80%, then pace.
  const rank = (a: BudgetAlert) => (a.key.endsWith(':100') ? 0 : a.key.endsWith(':80') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, MAX);
}
