import { describe, it, expect } from 'vitest';
import { derive } from '../lib/derive';
import { inFocus } from '../lib/txnFocus';
import { merchantKey } from '../lib/merchants';
import type { AppState, Txn } from '../types';

// Tapping a bar opens the payments behind it. If the list added up to anything
// other than the bar, the drill-in would undermine the chart it came from.

const D = 86400000;
const emptyArchive = {
  workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0,
  txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400,
};
const now = new Date(2026, 9, 21, 15, 0).getTime(); // a Wednesday afternoon
let n = 0;
const tx = (daysAgo: number, amount: number, over: Partial<Txn> = {}): Txn =>
  ({
    id: `t${++n}`, name: 'Carrefour', cat: 'Groceries', amount, income: false, accId: 'a', toAccId: null,
    adjust: false, note: null, photo: false, ts: now - daysAgo * D, ...over,
  }) as Txn;

const txns: Txn[] = [
  tx(0, -120),
  tx(0, -40, { name: 'Talabat', cat: 'Eating out' }),
  tx(0, 30), // refund: takes spending back
  tx(0, -500, { toAccId: 'b' }), // transfer: not spending
  tx(0, -75, { adjust: true }), // balance correction: not spending
  tx(0, 9000, { income: true, cat: 'Salary' }),
  tx(1, -60),
  tx(2, -15, { name: 'Talabat', cat: 'Eating out' }),
];
const state = {
  profile: { createdAt: now - 200 * D, avatar: null },
  habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns,
  accounts: [{ id: 'a', name: 'CIB' }, { id: 'b', name: 'Savings' }], fcats: [], budgets: [], goals: [], recurring: [],
  counters: [], countLogs: [], wTemplates: [], archive: emptyArchive,
} as unknown as AppState;

const total = (list: Txn[]) => list.reduce((s, t) => s - t.amount, 0);

describe('payments behind a chart', () => {
  const d = derive(state, 'Week', 0, now);

  it('lists exactly what each spending bar adds up', () => {
    d.buckets.forEach((b, i) => {
      const v = d.spendBuckets[i];
      if (v == null) return;
      const list = txns.filter((t) => inFocus({ title: b.name, start: b.start, end: b.end }, t));
      expect(total(list)).toBe(v);
    });
    const today = d.buckets.find((b) => b.current)!;
    const list = txns.filter((t) => inFocus({ title: today.name, start: today.start, end: today.end }, t));
    expect(total(list)).toBe(130); // 120 + 40 − 30, no transfer, correction or salary
  });

  it('matches a category slice and a place over the period', () => {
    const P = d.period;
    const food = d.fCatSegs.find((s) => s.label === 'Eating out')!;
    const inCat = txns.filter((t) => t.cat === 'Eating out' && inFocus({ title: P.caption, start: P.start, end: P.end }, t));
    expect(total(inCat)).toBe(food.value);
    const place = txns.filter((t) => inFocus({ title: 'Talabat', start: P.start, end: P.end, place: merchantKey('Talabat') }, t));
    expect(place.map((t) => t.name)).toEqual(['Talabat', 'Talabat']);
  });
});
