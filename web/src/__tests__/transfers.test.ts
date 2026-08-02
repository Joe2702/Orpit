import { describe, it, expect } from 'vitest';
import { derive } from '../lib/derive';
import { buildReport } from '../lib/report';
import type { AppState, Archive, Txn } from '../types';

// Transfers.
//
// Moving money between your own accounts is not income and not spending. The
// bug this replaces was quiet and total: a single 5,000 sweep into savings was
// counted as an expense, so spending spiked, the budget blew, the savings rate
// collapsed and the anomaly detector confidently reported a spending problem
// that never happened. Anyone with two accounts was being lied to.
//
// These pin the invariant from both ends: a transfer must move both balances,
// and must appear in no total that means "money earned" or "money gone".

const D = 86400000;
const now = Date.now();

const emptyArchive: Archive = {
  workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0,
  txnSum: 0, activeDays: 0, earliestTs: null, accSums: {}, windowDays: 400,
};

const acc = (id: string, opening: number) =>
  ({ id, name: 'Acc ' + id, type: 'Bank', color: 'blue', opening }) as never;

const spend = (id: string, amount: number, accId: string, ts = now - D): Txn =>
  ({ id, name: 'Thing', cat: 'Food', amount: -Math.abs(amount), income: false, accId, toAccId: null, adjust: false, note: null, photo: false, ts }) as Txn;

const earn = (id: string, amount: number, accId: string, ts = now - D): Txn =>
  ({ id, name: 'Pay', cat: 'Salary', amount: Math.abs(amount), income: true, accId, toAccId: null, adjust: false, note: null, photo: false, ts }) as Txn;

/** A transfer: one row, negative on the source, destination named separately. */
const move = (id: string, amount: number, from: string, to: string, ts = now - D): Txn =>
  ({ id, name: 'A → B', cat: 'Transfer', amount: -Math.abs(amount), income: false, accId: from, toAccId: to, adjust: false, note: null, photo: false, ts }) as Txn;

/** A balance correction: signed, on one account, neither earned nor spent. */
const fix = (id: string, amount: number, accId: string, ts = now - D): Txn =>
  ({ id, name: 'Balance correction', cat: 'Adjustment', amount, income: false, accId, toAccId: null, adjust: true, note: null, photo: false, ts }) as Txn;

function state(txns: Txn[], accounts = [acc('a', 1000), acc('b', 0)], archive: Partial<Archive> = {}): AppState {
  return {
    profile: { name: 'T', currency: 'EGP', createdAt: now - 200 * D },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns,
    accounts, fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { ...emptyArchive, ...archive },
  } as unknown as AppState;
}

describe('a transfer moves both balances', () => {
  it('leaves the source and lands in the destination', () => {
    const d = derive(state([move('1', 400, 'a', 'b')]), 'Month');
    const byId = Object.fromEntries(d.accounts.map((a) => [a.id, a.balance]));
    expect(byId.a).toBe(600);
    expect(byId.b).toBe(400);
  });

  it('leaves net worth untouched — the money never left', () => {
    const before = derive(state([]), 'Month').netWorth;
    const after = derive(state([move('1', 400, 'a', 'b')]), 'Month').netWorth;
    expect(after).toBe(before);
  });

  it('carries both sides of a pre-window transfer through the archive', () => {
    // Once the row ages past the window the server ships only per-account
    // totals. If the destination's share were missing, the balance would look
    // right for 400 days and then quietly drop.
    const d = derive(state([], undefined, { accSums: { a: -400, b: 400 } }), 'Month');
    const byId = Object.fromEntries(d.accounts.map((a) => [a.id, a.balance]));
    expect(byId.a).toBe(600);
    expect(byId.b).toBe(400);
    expect(d.netWorth).toBe(1000);
  });
});

describe('a transfer is neither spending nor income', () => {
  it('does not count as spending', () => {
    const withOnlyTransfer = derive(state([move('1', 5000, 'a', 'b', now - 2 * D)]), 'Month');
    expect(withOnlyTransfer.spent).toBe(0);
    expect(withOnlyTransfer.income).toBe(0);
  });

  it('does not move spending when added alongside real transactions', () => {
    const real = [spend('s', 300, 'a', now - 2 * D), earn('i', 1000, 'a', now - 3 * D)];
    const plain = derive(state(real), 'Month');
    const mixed = derive(state([...real, move('m', 5000, 'a', 'b', now - 2 * D)]), 'Month');
    expect(mixed.spent).toBe(plain.spent);
    expect(mixed.income).toBe(plain.income);
    expect(mixed.savingsRate).toBe(plain.savingsRate);
  });

  it('stays out of the monthly story report', () => {
    // buildReport works in calendar periods, so the rows are dated today and
    // the month is used — a rolling "two days ago" can land outside the window
    // and make this pass without testing anything.
    const real = [spend('s', 300, 'a', now), earn('i', 1000, 'a', now)];
    const slide = (st: AppState, key: string) =>
      buildReport(st, 'month').find((x) => x.key === key)?.value;

    const plain = state(real);
    const mixed = state([...real, move('m', 5000, 'a', 'b', now)]);

    expect(slide(mixed, 'spent')).toBe(slide(plain, 'spent'));
    expect(slide(mixed, 'spent')).toContain('300');
    expect(slide(mixed, 'topcat')).toBe('Food');
  });

  it('never appears as a spending category, however large', () => {
    // Budgets are driven off this map. A 9,000 sweep landing under "Transfer"
    // would dwarf every real category on the breakdown.
    // `catMonthSpent` is scoped to the calendar month, so both rows are dated
    // today — dating them "two days ago" silently empties the map on the 1st.
    const d = derive(state([spend('s', 50, 'a', now), move('m', 9000, 'a', 'b', now)]), 'Month');
    expect(Object.keys(d.catMonthSpent)).not.toContain('Transfer');
    expect(Object.values(d.catMonthSpent).reduce((a, b) => a + b, 0)).toBe(50);
  });
});


// Balance corrections.
//
// When the app's figure drifts from the bank's, the gap is recorded as a dated
// entry rather than by rewriting the opening balance. Rewriting it moved money
// with no trace and shifted every point on the net-worth chart, so last month
// showed a balance the user never had. A correction is real money — it must
// reach the balance and net worth — but it is not something the user earned or
// spent, so it has to stay out of every spending total, exactly like a transfer.

describe('a balance correction', () => {
  it('changes the account balance by the amount typed', () => {
    const up = derive(state([fix('f', 200, 'a')]), 'Month');
    expect(up.accounts.find((x) => x.id === 'a')!.balance).toBe(1200);
    const down = derive(state([fix('f', -350, 'a')]), 'Month');
    expect(down.accounts.find((x) => x.id === 'a')!.balance).toBe(650);
  });

  it('changes net worth — unlike a transfer, the money is really there', () => {
    const base = derive(state([]), 'Month').netWorth;
    expect(derive(state([fix('f', 200, 'a')]), 'Month').netWorth).toBe(base + 200);
  });

  it('is not income and not spending', () => {
    const real = [spend('s', 300, 'a', now), earn('i', 1000, 'a', now)];
    const plain = derive(state(real), 'Month');
    const fixed = derive(state([...real, fix('f', 5000, 'a', now)]), 'Month');
    expect(fixed.spent).toBe(plain.spent);
    expect(fixed.income).toBe(plain.income);
    expect(fixed.savingsRate).toBe(plain.savingsRate);
  });

  it('never lands in a spending category', () => {
    const d = derive(state([spend('s', 50, 'a', now), fix('f', -9000, 'a', now)]), 'Month');
    expect(Object.keys(d.catMonthSpent)).not.toContain('Adjustment');
    expect(Object.values(d.catMonthSpent).reduce((x, y) => x + y, 0)).toBe(50);
  });

  it('stays out of the story report', () => {
    const real = [spend('s', 300, 'a', now), earn('i', 1000, 'a', now)];
    const slide = (st: AppState, key: string) => buildReport(st, 'month').find((x) => x.key === key)?.value;
    expect(slide(state([...real, fix('f', -5000, 'a', now)]), 'spent')).toBe(slide(state(real), 'spent'));
  });

  it('does not rewrite history: earlier net worth is unchanged', () => {
    // The point of recording it as an entry. A correction made today belongs to
    // today — it must not retroactively raise what the charts say you had a
    // month ago, which is exactly what moving the opening balance did.
    const before = derive(state([spend('s', 100, 'a', now - 60 * D)]), 'Month').netWorthSeries;
    const after = derive(state([spend('s', 100, 'a', now - 60 * D), fix('f', 400, 'a', now)]), 'Month').netWorthSeries;
    // Every point except the last describes a month that ended before the fix.
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    // …and the correction must actually have landed, at the end, not nowhere.
    expect(after[after.length - 1]).toBe(before[before.length - 1] + 400);
  });
});
