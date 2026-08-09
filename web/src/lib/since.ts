// "3 years, 5 months and 2 days."
//
// Counting elapsed calendar time is one of those problems that looks like
// division and isn't. Months have different lengths, years have different
// numbers of days, and a naive `days / 365` drifts by a day every four years —
// which is exactly the kind of error someone counting since their child was
// born will notice.
//
// So this counts the way a person does: whole years first, then whole months,
// then the days left over.

const DAY = 86400000;

export interface Elapsed {
  years: number;
  months: number;
  days: number;
  /** Every day, for the small print and for sorting. */
  totalDays: number;
}

/**
 * Day number in the local calendar, ignoring clock time.
 *
 * Going through UTC deliberately: subtracting two local timestamps gives 23 or
 * 25 hours across a daylight-saving change, so a difference in milliseconds
 * silently loses or gains a day twice a year. Calendar dates have no such
 * problem once the time of day is discarded.
 */
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** Calendar months added to a date, clamped to the target month's length. */
function addMonths(y: number, m: number, d: number, n: number): [number, number, number] {
  const total = m + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return [ny, nm, Math.min(d, lastDay)];
}

/**
 * How long between two moments, in calendar terms.
 *
 * A future date returns all zeros rather than negatives: somebody typing next
 * year's date has made a mistake, and "-3 months" is not a useful way to say so.
 */
export function elapsed(fromTs: number, toTs: number = Date.now()): Elapsed {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  const fromDay = dayNumber(from);
  const toDay = dayNumber(to);
  if (toDay <= fromDay) return { years: 0, months: 0, days: 0, totalDays: Math.max(0, toDay - fromDay) };

  const fy = from.getFullYear();
  const fm = from.getMonth();
  const fd = from.getDate();

  // Whole months are counted by the day of the month, not by clamping to the
  // end of a short one. Since 31 January, the 28th of February is 28 days —
  // not "1 month", which is what clamping claims. Both conventions exist; this
  // one never overstates, and for a streak somebody is proud of, rounding up is
  // the wrong way to be wrong. (It is also what java.time.Period does.)
  let months = (to.getFullYear() - fy) * 12 + (to.getMonth() - fm);
  if (months > 0 && to.getDate() < fd) months--;
  const [ay, am, ad] = addMonths(fy, fm, fd, months);

  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: toDay - Math.floor(Date.UTC(ay, am, ad) / DAY),
    totalDays: toDay - fromDay,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Read it aloud: "3 years, 5 months and 2 days".
 *
 * Zero components are dropped — "0 years 2 months 0 days" is how a computer
 * counts, not how anyone speaks — but something always comes back, so a
 * milestone set today reads "Today" rather than an empty line.
 */
export function formatElapsed(e: Elapsed): string {
  const parts: string[] = [];
  if (e.years) parts.push(plural(e.years, 'year'));
  if (e.months) parts.push(plural(e.months, 'month'));
  if (e.days) parts.push(plural(e.days, 'day'));
  if (parts.length === 0) return 'Today';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The compact form for a tight space: "3y 5m 2d". */
export function shortElapsed(e: Elapsed): string {
  const parts: string[] = [];
  if (e.years) parts.push(`${e.years}y`);
  if (e.months) parts.push(`${e.months}m`);
  if (e.days || parts.length === 0) parts.push(`${e.days}d`);
  return parts.join(' ');
}

/** The next round number worth noticing, for a bit of anticipation. */
export function nextMilestone(e: Elapsed): { label: string; daysAway: number } | null {
  const marks = [100, 365, 500, 1000, 1500, 2000, 3000, 5000, 10000];
  const next = marks.find((m) => m > e.totalDays);
  if (next == null) return null;
  return { label: `${next.toLocaleString()} days`, daysAway: next - e.totalDays };
}
