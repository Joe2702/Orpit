import type { AppState, Txn } from '../types';
import { merchantKey, isGenericName } from './merchants';
import { isSpend } from './money';

// Subscriptions and bills, found in what's already been paid.
//
// Netflix, the gym, the phone bill, the rent: the same payee, about the same
// amount, about a month apart. People routinely underestimate what these add
// up to, and they're the one kind of spending that can be cut once and stay
// cut. Finding them means nobody has to remember to set them up, and they then
// count as expected payments (a bill reminder, matching the bank's message
// when it comes).

export interface FoundRecurring {
  /** The shop as the user's entries name it. */
  name: string;
  cat: string;
  accId: string | null;
  /** The typical amount: the median of the payments seen. */
  amount: number;
  freq: 'Monthly' | 'Weekly';
  /** When the next one is due, from the last one and the usual gap. */
  nextTs: number;
  /** How many payments it was found from. */
  seen: number;
  income: boolean;
}

const DAY = 86_400_000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Payees paid on a steady rhythm that aren't set up as recurring yet.
 *
 * Monthly: at least two gaps of 26–35 days, the latest payment within the
 * last 45 days. Weekly: at least three gaps of 6–8 days, the latest within 10.
 * Amounts within 15% of the typical one, so a supermarket visited every month
 * for wildly different totals doesn't count, but a phone bill that moves a
 * little does. Salaries count too, as expected income.
 */
export function findRecurring(state: AppState, now: number = Date.now()): FoundRecurring[] {
  const known = new Set(state.recurring.map((r) => merchantKey(r.name)).filter(Boolean));
  const groups = new Map<string, Txn[]>();
  for (const t of state.txns) {
    if (t.toAccId || t.adjust || t.ts > now) continue;
    if (!(isSpend(t) && t.amount < 0) && !(t.income && t.amount > 0)) continue;
    const k = merchantKey(t.name);
    // An entry named after its category ("Food") is a manual note, not a payee.
    if (!k || k === merchantKey(t.cat) || known.has(k) || isGenericName(t.name)) continue;
    const key = `${t.income ? 'in' : 'out'}:${k}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const found: FoundRecurring[] = [];
  for (const list of groups.values()) {
    // Two gaps at least: three payments, so two in a row isn't a pattern yet.
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const typical = median(amounts);
    // The run of payments at a steady amount, newest backwards.
    const steady = sorted.filter((t) => Math.abs(Math.abs(t.amount) - typical) <= typical * 0.15);
    if (steady.length < 2) continue;
    const gaps = steady.slice(1).map((t, i) => (t.ts - steady[i].ts) / DAY);
    const last = steady[steady.length - 1];
    const monthly = gaps.filter((g) => g >= 26 && g <= 35).length;
    const weekly = gaps.filter((g) => g >= 6 && g <= 8).length;
    let freq: FoundRecurring['freq'] | null = null;
    let every = 0;
    if (monthly >= 2 && monthly >= gaps.length * 0.6 && now - last.ts <= 45 * DAY) {
      freq = 'Monthly';
      every = 30;
    } else if (weekly >= 3 && weekly >= gaps.length * 0.6 && now - last.ts <= 10 * DAY) {
      freq = 'Weekly';
      every = 7;
    }
    if (!freq) continue;
    const typicalGap = median(gaps.filter((g) => (freq === 'Monthly' ? g >= 26 && g <= 35 : g >= 6 && g <= 8)));
    let next = last.ts + Math.round(typicalGap || every) * DAY;
    while (next < now) next += every * DAY;
    found.push({
      name: last.name,
      cat: last.cat,
      accId: last.accId,
      amount: Math.round(typical * 100) / 100,
      freq,
      nextTs: next,
      seen: steady.length,
      income: !!last.income,
    });
  }
  return found.sort((a, b) => b.amount - a.amount);
}

/** What a list of recurring payments comes to in a month. */
export const monthlyCost = (items: { amount: number; freq: string; income?: boolean }[]): number =>
  items
    .filter((r) => !r.income)
    .reduce((s, r) => s + (r.freq === 'Weekly' ? r.amount * 4.33 : r.freq === 'Yearly' ? r.amount / 12 : r.amount), 0);
