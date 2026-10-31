import type { Range } from '../types';
import { date, dateRange, getLang, num, t } from '../i18n';

// What "this week", "this month" and "this year" mean, decided once.
//
// The app used to answer that question in five places and get five answers.
// Charts used rolling windows — the "Year" chart ran November to October and
// was captioned "this year" — while the story report used calendar periods,
// weeks started on Monday in one place and Sunday in another, and the habit
// ring counted the last seven days under a row of Sunday-to-Saturday circles.
// Each was defensible alone; together, no two numbers on screen described the
// same stretch of time, which reads to a person as "the charts are wrong".
//
// Everything is calendar-aligned now: a week is Sunday to Saturday, a month is
// the month, a year is January to December. Periods that haven't finished keep
// their full shape, with the days still to come drawn as empty slots, so a
// Thursday's week chart shows where Thursday sits in the week rather than
// stretching four days across the whole width.
//
// All arithmetic goes through local calendar fields (setDate, setMonth), never
// by adding multiples of 24 hours. On the night clocks change a day is 23 or 25
// hours long, and stepping by 86,400,000 ms drifts every bucket after it off
// midnight — an entry logged at 23:30 lands on the wrong day.

/** Sunday. Matches the habit schedule mask (Sun..Sat) and the work week here. */
export const WEEK_STARTS_ON = 0;

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LETTERS = 'JFMAMJJASOND';
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// English keeps its hand-picked short forms; Arabic asks the platform, which
// knows the Egyptian month names and the one-letter day initials (ح ن ث ر خ ج س).
const ar = () => getLang() === 'ar';
const dayRef = (d: number) => new Date(2026, 0, 4 + d); // Jan 4 2026 was a Sunday
const monthRef = (m: number) => new Date(2026, m, 1);
/** One letter for a chart axis. */
export const dayLetter = (d: number) => (ar() ? date(dayRef(d), { weekday: 'narrow' }) : DAY_LETTERS[d]);
export const dayName = (d: number) => (ar() ? date(dayRef(d), { weekday: 'long' }) : DAY_NAMES[d]);
const monthLetter = (m: number) => (ar() ? date(monthRef(m), { month: 'narrow' }) : MONTH_LETTERS[m]);
export const monthShort = (m: number) => (ar() ? date(monthRef(m), { month: 'short' }) : MONTH_SHORT[m]);
export const monthLong = (m: number) => (ar() ? date(monthRef(m), { month: 'long' }) : MONTH_LONG[m]);
const yr = (y: number) => num(y, { useGrouping: false });

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The same wall-clock midnight `n` calendar days away; safe across DST. */
export function addDays(ts: number, n: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() - WEEK_STARTS_ON + 7) % 7));
  return d.getTime();
}

export function startOfMonth(ts: number, plus = 0): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + plus, 1).getTime();
}

/** Whole calendar days from `a` to `b`, counting midnights crossed. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export interface Bucket {
  start: number;
  end: number;
  /** Short axis label. Empty for buckets that don't get one. */
  label: string;
  /** Full name, for screen readers and tooltips. */
  name: string;
  /** Hasn't started yet: drawn as an empty slot, never as a zero. */
  future: boolean;
  /** Contains right now. */
  current: boolean;
}

export interface Period {
  range: Range;
  offset: number;
  start: number;
  /** Exclusive end of the whole period, which may lie in the future. */
  end: number;
  /** Exclusive end of what has actually happened: min(end, now). */
  until: number;
  /** Days elapsed so far, at least 1 — the honest divisor for "per day". */
  days: number;
  buckets: Bucket[];
  /** "This week", "Last month", "2025". */
  title: string;
  /** The dates in words: "Oct 18 – 24", "October 2026", "Since Aug 2025". */
  caption: string;
  /** For inline copy: "this week", "in March", "in 2025", "all time". */
  phrase: string;
  isCurrent: boolean;
  /** Whether stepping one period further back can show anything. */
  hasPrev: boolean;
}

const shortDate = (ts: number) => {
  if (ar()) return date(ts, { day: 'numeric', month: 'short' });
  const d = new Date(ts);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
};

/** "Oct 18 – 24", "Sep 28 – Oct 4", "Dec 28, 2025 – Jan 3, 2026". */
export function rangeCaption(start: number, endExclusive: number): string {
  const a = new Date(start);
  const b = new Date(addDays(endExclusive, -1));
  if (ar()) return dateRange(start, b.getTime(), a.getFullYear() !== b.getFullYear() ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  if (a.getFullYear() !== b.getFullYear()) return `${shortDate(start)}, ${a.getFullYear()} – ${shortDate(b.getTime())}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${shortDate(start)} – ${b.getDate()}`;
  return `${shortDate(start)} – ${shortDate(b.getTime())}`;
}

export function period(range: Range, offset = 0, opts: { now?: number; earliest?: number } = {}): Period {
  const now = opts.now ?? Date.now();
  const earliest = Math.min(opts.earliest ?? now, now);
  const off = Math.max(0, Math.floor(offset));
  const buckets: Bucket[] = [];
  let start: number;
  let end: number;
  let title: string;
  let caption: string;
  let phrase: string;

  const push = (s: number, e: number, label: string, name: string) =>
    buckets.push({ start: s, end: e, label, name, future: s > now, current: s <= now && now < e });

  if (range === 'Week') {
    start = addDays(startOfWeek(now), -7 * off);
    end = addDays(start, 7);
    for (let i = 0; i < 7; i++) {
      const s = addDays(start, i);
      const dow = new Date(s).getDay();
      push(s, addDays(start, i + 1), dayLetter(dow), ar() ? date(s, { weekday: 'long', day: 'numeric', month: 'short' }) : `${DAY_NAMES[dow]}, ${shortDate(s)}`);
    }
    title = off === 0 ? t('This week') : off === 1 ? t('Last week') : t('Week of {date}', { date: shortDate(start) });
    caption = rangeCaption(start, end);
    phrase = off === 0 ? t('this week') : off === 1 ? t('last week') : t('the week of {date}', { date: shortDate(start) });
  } else if (range === 'Month') {
    start = startOfMonth(now, -off);
    end = startOfMonth(start, 1);
    const n = daysBetween(start, end);
    for (let i = 0; i < n; i++) {
      const s = addDays(start, i);
      const day = i + 1;
      // A label every week from the 1st keeps five of them on any month, with
      // none crowding the next.
      push(s, addDays(start, i + 1), day % 7 === 1 ? num(day) : '', shortDate(s));
    }
    const d = new Date(start);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    title =
      off === 0
        ? t('This month')
        : off === 1
          ? t('Last month')
          : sameYear
            ? monthLong(d.getMonth())
            : t('{month} {year}', { month: monthShort(d.getMonth()), year: yr(d.getFullYear()) });
    caption = t('{month} {year}', { month: monthLong(d.getMonth()), year: yr(d.getFullYear()) });
    phrase = off === 0 ? t('this month') : off === 1 ? t('last month') : t('in {month}', { month: monthLong(d.getMonth()) });
  } else if (range === 'Year') {
    const y = new Date(now).getFullYear() - off;
    start = new Date(y, 0, 1).getTime();
    end = new Date(y + 1, 0, 1).getTime();
    for (let m = 0; m < 12; m++) {
      push(new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime(), monthLetter(m), t('{month} {year}', { month: monthLong(m), year: yr(y) }));
    }
    title = off === 0 ? t('This year') : off === 1 ? t('Last year') : yr(y);
    caption = off === 0 ? t('{from} – {to} {year}', { from: monthShort(0), to: monthShort(new Date(now).getMonth()), year: yr(y) }) : yr(y);
    phrase = off === 0 ? t('this year') : t('in {year}', { year: yr(y) });
  } else {
    // All time, a month per bar. A short history still gets a few bars so one
    // month of data doesn't fill the chart edge to edge.
    const a = new Date(earliest);
    const b = new Date(now);
    const thisMonth = startOfMonth(now);
    const months = Math.max(6, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1);
    start = startOfMonth(thisMonth, -(months - 1));
    end = startOfMonth(thisMonth, 1);
    const every = months <= 12 ? 1 : Math.ceil(months / 6);
    for (let i = 0; i < months; i++) {
      const s = startOfMonth(start, i);
      const d = new Date(s);
      // Count back from the newest bar so the current month is always labelled.
      const tick = (months - 1 - i) % every === 0;
      const label = !tick ? '' : every === 1 ? monthLetter(d.getMonth()) : monthShort(d.getMonth());
      push(s, startOfMonth(s, 1), label, t('{month} {year}', { month: monthLong(d.getMonth()), year: yr(d.getFullYear()) }));
    }
    const e = new Date(startOfMonth(earliest));
    title = t('All time');
    caption = t('Since {month} {year}', { month: monthShort(e.getMonth()), year: yr(e.getFullYear()) });
    phrase = t('all time');
  }

  const until = Math.min(end, now);
  return {
    range,
    offset: off,
    start,
    end,
    until,
    days: Math.max(1, daysBetween(start, until) + (until === now ? 1 : 0)),
    buckets,
    title,
    caption,
    phrase,
    isCurrent: start <= now && now < end,
    hasPrev: range !== 'All' && start > startOfDay(earliest),
  };
}

/** Index of the bucket holding `ts`, or -1. Buckets are contiguous and sorted. */
export function bucketOf(buckets: Bucket[], ts: number): number {
  if (!buckets.length || ts < buckets[0].start || ts >= buckets[buckets.length - 1].end) return -1;
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (buckets[mid].start <= ts) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Week number within the year, counting the week holding Jan 1 as week 1. */
export function weekOfYear(ts: number): { week: number; of: number } {
  const y = new Date(ts).getFullYear();
  const first = startOfWeek(new Date(y, 0, 1).getTime());
  const last = startOfWeek(new Date(y, 11, 31).getTime());
  return { week: Math.floor(daysBetween(first, startOfWeek(ts)) / 7) + 1, of: Math.floor(daysBetween(first, last) / 7) + 1 };
}
