import type { SafeToSpend } from './safeToSpend';
import { money0 } from './format';
import { startOfWeek } from './period';
import { t, tn } from '../i18n';

// The last thing a log leaves on screen.
//
// Saving used to end on "Transaction saved": true, and nothing more. The end
// of a task is half of what people remember of it, so it now closes with the
// one fact that saving just changed: what's left to spend a day after a
// payment, how many workouts the week holds after a session.

export type TxnKind = 'expense' | 'income' | 'refund' | 'transfer';

/**
 * The message after adding a transaction. `safe` is safe-to-spend worked out
 * with the new entry included; it's only quoted for an entry in this month,
 * since an old receipt doesn't change what's left now.
 */
export function savedTxnMessage(kind: TxnKind, safe: SafeToSpend | null, thisMonth: boolean): string {
  if (kind === 'transfer') return t('Transfer saved');
  if (kind === 'refund') return t('Refund added');
  const known = safe && thisMonth;
  if (kind === 'income')
    return known && safe.left > 0 ? t('Income added · {amount} a day for the rest of the month', { amount: money0(safe.perDay) }) : t('Income added');
  if (!known) return t('Expense added');
  return safe.left > 0
    ? t('Expense added · {amount} a day for the rest of the month', { amount: money0(safe.perDay) })
    : t('Expense added · {amount} over what this month allows', { amount: money0(-safe.left) });
}

/** The message after logging a workout: how many this week, counting this one. */
export function workoutLoggedMessage(workoutTimes: number[], loggedAt: number, now: number = Date.now()): string {
  const from = startOfWeek(now);
  if (loggedAt < from || loggedAt > now + 86_400_000) return t('Workout logged');
  const n = workoutTimes.filter((ts) => ts >= from && ts <= now + 86_400_000).length;
  return tn(n, 'Workout logged · {n} this week', 'Workout logged · {n} this week');
}
