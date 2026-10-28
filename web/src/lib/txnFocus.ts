import type { Txn } from '../types';
import { isSpend } from './money';
import { merchantKey } from './merchants';

/** Opened from a chart: the spending behind one bar, category slice or place. */
export interface TxnFocus {
  /** What was tapped, in words: "Monday, Oct 19", "October 2026". */
  title: string;
  start: number;
  /** Exclusive. */
  end: number;
  /** A merchantKey, when a place was tapped. */
  place?: string;
}

/**
 * The same rule the charts add up with (no transfers, no balance corrections,
 * refunds counted back), so the list under a bar totals what the bar said.
 */
export const inFocus = (f: TxnFocus, t: Txn): boolean =>
  !t.toAccId &&
  !t.adjust &&
  isSpend(t) &&
  t.ts >= f.start &&
  t.ts < f.end &&
  (!f.place || merchantKey(t.name) === f.place);
