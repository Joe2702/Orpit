import { dayKey } from './format';
import { addDays } from './period';

/**
 * How many of a habit's scheduled days have gone by without it, counting back
 * from yesterday until the last time it was done. 0 when yesterday was done
 * (or wasn't scheduled and the one before was).
 *
 * The Home nudge changes with it. One miss is "don't miss it twice": the
 * habit is intact (one missed day barely affects how a habit forms) and the
 * risk is the second. A longer gap is a different moment: the habit has
 * lapsed, "you missed it yesterday" is no longer true, and what helps someone
 * restart is a smaller step, not a reminder of the streak they lost.
 *
 * Never counts past `limit` scheduled days, and a habit never done at all has
 * no lapse to come back from.
 */
export function missedRun(days: string, done: Set<string>, now: number = Date.now(), limit = 30): number {
  const mask = days && days.length === 7 ? days : '1111111';
  if (!done.size) return 0;
  let missed = 0;
  let t = addDays(now, -1);
  for (let i = 0; i < 400 && missed < limit; i++, t = addDays(t, -1)) {
    if (mask[new Date(t).getDay()] !== '1') continue;
    if (done.has(dayKey(t))) return missed;
    missed++;
  }
  return missed;
}
