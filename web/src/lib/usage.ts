import { dayKey } from './format';

// Counting which features get used, for the developer's retention numbers.
//
// A name and a count per day ("habit_check: 3"), nothing else: no amounts, no
// names of shops or habits, no message text. Kept on the phone and sent in one
// small request now and then, so it costs nothing while offline and never gets
// in the way of a real save. Off when the user turns it off in Settings, and
// the server drops anything already counted.

export type UsageName =
  | 'open'
  | 'habit_check'
  | 'workout_add'
  | 'sleep_add'
  | 'txn_add'
  | 'sms_import'
  | 'review_answer'
  | 'week_review'
  | 'bank_on'
  | 'budget_alert'
  | 'report_view'
  | 'partner_open'
  | 'brief_open';

const KEY = 'orbit_usage';
let enabled = true;

interface Pending {
  day: string;
  counts: Partial<Record<UsageName, number>>;
}

function read(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(p: Pending[]) {
  try {
    // A week at most: an install that never reaches the server shouldn't grow forever.
    localStorage.setItem(KEY, JSON.stringify(p.slice(-7)));
  } catch {
    /* a lost count is not worth anything more */
  }
}

/** Follows the account's setting. */
export function setUsageSharing(on: boolean): void {
  enabled = on;
  if (!on) write([]);
}

export function track(name: UsageName): void {
  if (!enabled) return;
  const day = dayKey();
  const all = read();
  let today = all.find((p) => p.day === day);
  if (!today) {
    today = { day, counts: {} };
    all.push(today);
  }
  today.counts[name] = (today.counts[name] || 0) + 1;
  write(all);
}

let flushing = false;
/** Send what's been counted. Drops nothing unless the server took it. */
export async function flushUsage(send: (day: string, counts: Pending['counts']) => Promise<unknown>): Promise<void> {
  if (!enabled || flushing) return;
  flushing = true;
  try {
    for (const p of read()) {
      if (!Object.keys(p.counts).length) continue;
      await send(p.day, p.counts);
      write(read().filter((x) => x.day !== p.day));
    }
  } catch {
    /* next time */
  } finally {
    flushing = false;
  }
}
