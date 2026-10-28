import type { Txn } from '../types';

// What counts as spending and what as income.
//
// Not just the sign. Money back for a purchase (a refund, a reversed charge)
// is positive but isn't earnings: counted as income it inflates the month's
// income and leaves the purchase it cancels in the spending, so both totals
// are wrong by the same amount. It is spending in reverse.

export const isRefund = (t: Pick<Txn, 'amount' | 'income' | 'adjust' | 'toAccId'>): boolean =>
  t.amount > 0 && !t.income && !t.adjust && !t.toAccId;

/** Counts toward spending, as -amount: payments out, and refunds taking it back. */
export const isSpend = (t: Pick<Txn, 'amount' | 'income' | 'adjust' | 'toAccId'>): boolean => t.amount < 0 || isRefund(t);

export const isIncome = (t: Pick<Txn, 'amount' | 'income'>): boolean => t.amount > 0 && !!t.income;
