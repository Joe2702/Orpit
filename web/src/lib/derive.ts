import { isSpend, isIncome } from './money';
import { accountBalance } from './ledger';
import { merchantKey, isGenericName } from './merchants';
import { safeToSpend } from './safeToSpend';
import type { AppState, Range } from '../types';
import { dayKey, fmtDate } from './format';
import { addDays, bucketOf, daysBetween, monthShort, period, startOfDay, startOfMonth, startOfWeek, type Bucket, type Period } from './period';
import { t } from '../i18n';

const shades = [100, 72, 50, 33, 22, 15];

export type { Bucket, Period };

/**
 * Per-bucket totals or averages. Future buckets come back as null rather than
 * zero: "nothing yet" and "nothing happened" are different things on a chart,
 * and drawing Saturday as a zero on a Thursday says the second.
 */
function aggSeries<T extends { ts: number }>(
  items: T[],
  buckets: Bucket[],
  valFn: (it: T) => number,
  mode: 'sum' | 'avg'
): (number | null)[] {
  const sums = buckets.map(() => 0),
    cnts = buckets.map(() => 0);
  items.forEach((it) => {
    const i = bucketOf(buckets, it.ts);
    if (i < 0) return;
    sums[i] += valFn(it);
    cnts[i]++;
  });
  return buckets.map((b, i) => (b.future ? null : mode === 'avg' ? (cnts[i] ? sums[i] / cnts[i] : null) : sums[i]));
}

/** Zero-filled copy, for consumers that only ever want numbers. */
const nums = (xs: (number | null)[]) => xs.map((x) => x ?? 0);

function monthStart(off: number, now: number = Date.now()): number {
  return startOfMonth(now, -(off || 0));
}

function budgetColor(pct: number): string {
  return pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--emerald)';
}

// ----- Habit helpers, computed from real check-in history -----

// Local calendar day — must match how check-ins are keyed everywhere else.
const dayStr = dayKey;
const maskOf = (days: string) => (/^[01]{7}$/.test(days) ? days : '1111111');

export interface HabitDerived {
  id: string;
  name: string;
  color: string;
  target: string;
  locked: boolean;
  days: string;
  done: boolean;
  total: number; // total days ever completed (replaces streaks)
  streak: number;
  paused: boolean;
  why: string | null;
  /** When and where it happens, if the user wrote it down. */
  cue: string | null;
  /** This habit's own reminder time (HH:MM), or null for the daily one. */
  reminderTime: string | null;
  // One 0/1 per *scheduled* weekday in the current week (Sun→Sat order);
  // 1 = checked in that day, 0 = missed or still upcoming. Length equals the
  // number of days the habit is assigned per week.
  weekSlots: number[];
  /** The weekday (0 = Sunday) each entry of `weekSlots` belongs to. */
  weekDays: number[];
}

/**
 * Scheduled vs completed habit-days from `start` up to (not including) `until`.
 * Walks calendar days, so a 23- or 25-hour day can't skip or repeat one.
 */
function scheduledStats(mask: string, set: Set<string>, start: number, until: number) {
  const m = maskOf(mask);
  let scheduled = 0,
    done = 0;
  for (let t = startOfDay(start); t < until; t = addDays(t, 1)) {
    if (m[new Date(t).getDay()] === '1') {
      scheduled++;
      if (set.has(dayStr(t))) done++;
    }
  }
  return { scheduled, done };
}

// The current week's scheduled days as 0/1, Sun→Sat; upcoming days stay 0.
function weekSlotsFor(mask: string, set: Set<string>, now: number): { slots: number[]; days: number[] } {
  const m = maskOf(mask);
  const ws = startOfWeek(now);
  const today = startOfDay(now);
  const slots: number[] = [];
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = addDays(ws, i);
    const wd = new Date(t).getDay();
    if (m[wd] !== '1') continue;
    days.push(wd);
    slots.push(t <= today && set.has(dayStr(t)) ? 1 : 0);
  }
  return { slots, days };
}

export function deriveHabits(state: AppState, range: Range, offset = 0, now: number = Date.now()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  // Archived habits disappear from the app (history is kept); paused ones stay
  // visible but stop counting toward progress, so travel/illness can't break a run.
  const live = state.habits.filter((h) => !h.archived);
  const counted = live.filter((h) => !h.paused);
  const byHabit = new Map<string, Set<string>>();
  state.habits.forEach((h) => byHabit.set(h.id, new Set()));
  state.checkins.forEach((c) => byHabit.get(c.habitId)?.add(c.day));

  const habits: HabitDerived[] = live.map((h) => {
    const set = byHabit.get(h.id)!;
    const done = set.has(dayStr(today));
    // Current streak (kept for internal stats, no longer shown to the user).
    // Today doesn't break it until it's over.
    let streak = 0;
    let cursor = done ? today : addDays(today, -1);
    while (set.has(dayStr(cursor))) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    const wk = weekSlotsFor(h.days, set, now);
    return {
      id: h.id,
      name: h.name,
      color: h.color,
      target: h.target,
      locked: h.locked,
      days: h.days,
      done,
      paused: h.paused,
      why: h.why,
      cue: h.cue ?? null,
      reminderTime: h.reminderTime,
      total: set.size, // total days ever completed
      streak,
      weekSlots: wk.slots,
      weekDays: wk.days,
    };
  });

  // Longest run of consecutive days, per habit, across all of them. Measured
  // in calendar days: the old millisecond test (exactly 24h apart) treated the
  // night the clocks change as a gap and quietly cut every streak across it.
  let longestStreak = 0;
  byHabit.forEach((set) => {
    const days = [...set].sort();
    let run = 0,
      prev: number | null = null;
    for (const ds of days) {
      const t = new Date(ds + 'T00:00:00').getTime();
      if (prev != null && daysBetween(prev, t) === 1) run++;
      else run = 1;
      if (run > longestStreak) longestStreak = run;
      prev = t;
    }
  });

  // 12-week heatmap grid [col][row], levels 0-4, from real daily check-in counts.
  const cols = 12;
  const grid: number[][] = Array.from({ length: cols }, () => new Array(7).fill(0));
  const curWeek = startOfWeek(today);
  const total = state.habits.length || 1;
  const counts = new Map<string, number>();
  state.checkins.forEach((c) => counts.set(c.day, (counts.get(c.day) || 0) + 1));
  counts.forEach((count, ds) => {
    const t = new Date(ds + 'T00:00:00').getTime();
    const wi = Math.round(daysBetween(startOfWeek(t), curWeek) / 7);
    if (wi < 0 || wi >= cols) return;
    const col = cols - 1 - wi;
    const row = new Date(t).getDay();
    const ratio = count / total;
    grid[col][row] = count === 0 ? 0 : Math.min(4, Math.max(1, Math.round(ratio * 4)));
  });

  // Progress over the selected period (Habits screen), and over this calendar
  // week so far (Home, Analytics, the widget). Both count only days that have
  // started, so a Monday doesn't read as a failed week.
  const earliestMs = state.checkins.length
    ? Math.min(...state.checkins.map((c) => new Date(c.day + 'T00:00:00').getTime()))
    : now;
  const P = period(range, offset, { now, earliest: earliestMs });
  const rangeStart = range === 'All' ? startOfDay(earliestMs) : P.start;
  const rangeUntil = Math.min(P.end, tomorrow);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 7);
  let rangeDone = 0,
    rangeTotal = 0,
    weekDone = 0,
    weekTotal = 0,
    weekPlanned = 0;
  // Per habit too, so a list under the period can show each one's share.
  const rangeByHabit: Record<string, { done: number; scheduled: number }> = {};
  live.forEach((h) => (rangeByHabit[h.id] = scheduledStats(h.days, byHabit.get(h.id)!, rangeStart, rangeUntil)));
  counted.forEach((h) => {
    const set = byHabit.get(h.id)!;
    const r = rangeByHabit[h.id];
    rangeDone += r.done;
    rangeTotal += r.scheduled;
    const w = scheduledStats(h.days, set, weekStart, tomorrow);
    weekDone += w.done;
    weekTotal += w.scheduled;
    weekPlanned += scheduledStats(h.days, set, weekStart, weekEnd).scheduled;
  });
  const rangePct = rangeTotal ? Math.round((rangeDone / rangeTotal) * 100) : 0;
  const habitPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
  // Each day of this week as a share of what was scheduled; null for days ahead.
  const weekDaily: (number | null)[] = [];
  for (let i = 0; i < 7; i++) {
    const t = addDays(weekStart, i);
    if (t > today) {
      weekDaily.push(null);
      continue;
    }
    let sched = 0,
      done = 0;
    counted.forEach((hb) => {
      const r = scheduledStats(hb.days, byHabit.get(hb.id)!, t, addDays(t, 1));
      sched += r.scheduled;
      done += r.done;
    });
    weekDaily.push(sched ? Math.round((done / sched) * 100) : 0);
  }

  // ---- Forgiving weekly streak ----
  // Daily streaks punish a single missed day, which is why people quit. This
  // counts *weeks* instead: a week "counts" if you completed at least 70% of
  // what you scheduled. The current (incomplete) week never breaks it.
  const GOOD = 0.7;
  const weekScore = (ws: number) => {
    const until = Math.min(addDays(ws, 7), tomorrow);
    let done = 0,
      sched = 0;
    counted.forEach((h) => {
      const r = scheduledStats(h.days, byHabit.get(h.id)!, ws, until);
      done += r.done;
      sched += r.scheduled;
    });
    return { done, sched, ok: sched > 0 && done / sched >= GOOD };
  };

  let weekStreak = 0;
  // Start from last week; a good current week adds to it, a weak one doesn't break it.
  for (let w = 1; w < 104; w++) {
    const s = weekScore(addDays(weekStart, -7 * w));
    if (!s.sched) break; // no data that far back
    if (!s.ok) break;
    weekStreak++;
  }
  // The goal is 70% of the *whole* week's plan, not of the days gone so far:
  // judged on days-so-far, one check-in on a Sunday morning "secured" the week.
  const weekGoal = Math.ceil(weekPlanned * GOOD);
  const weekToGo = Math.max(0, weekGoal - weekDone);
  const weekSecured = weekGoal > 0 && weekDone >= weekGoal;
  if (weekSecured) weekStreak++;

  const totalCompleted = state.checkins.length; // all-time check-ins across habits
  return {
    habits,
    longestStreak,
    totalCompleted,
    grid,
    habitPct,
    weekDone,
    weekTotal,
    weekPlanned,
    weekStreak,
    weekGoal,
    weekToGo,
    weekSecured,
    rangeDone,
    rangeTotal,
    rangePct,
    rangeByHabit,
    weekDaily,
    period: P,
  };
}

export function derive(state: AppState, range: Range, offset = 0, now: number = Date.now()) {
  const t0 = startOfDay(now);
  /** Calendar days before today: 0 = today, 1 = yesterday. */
  const dayIdx = (ts: number) => daysBetween(ts, t0);

  const W = state.workouts,
    N = state.nights,
    // Two views of the ledger. Each answers a different question, and using
    // the wrong one is how a finance app quietly starts lying.
    //
    // ALL — every row. What does this account hold? Balances, and net worth as
    //   their sum, use it.
    //
    // T  — money that actually came in or went out. Everything else uses this:
    //   budgets, categories, savings rate, insights, the story report. Neither
    //   a transfer nor a correction is spending, and counting either one makes
    //   a move to savings read as a spending spree — blowing the budget,
    //   sinking the savings rate and tripping the anomaly detector. Filtering
    //   once here is what keeps the thirty totals downstream honest, rather
    //   than remembering to exclude them in thirty separate places.
    ALL = state.txns,
    T = state.txns.filter((t) => !t.toAccId && !t.adjust);

  const allTs = ([] as number[]).concat(W.map((x) => x.ts), N.map((x) => x.ts), ALL.map((x) => x.ts));
  const allMin = allTs.length ? Math.min.apply(null, allTs) : now;
  const P = period(range, offset, { now, earliest: allMin });
  const buckets = P.buckets;
  const winStart = P.start,
    winEnd = P.end;
  const inWin = (ts: number) => ts >= winStart && ts < winEnd;
  const xLabels = buckets.map((b) => b.label);
  /** Where "now" sits on the chart, for the highlighted bar. -1 for a past period. */
  const currentIdx = buckets.findIndex((b) => b.current);

  // ---- Workouts ----
  const Wr = W.filter((w) => inWin(w.ts));
  const wCount = Wr.length,
    wTotalMin = Wr.reduce((s, w) => s + (w.dur || 0), 0);
  // Days in a row with a workout. Today doesn't break the run until it's over.
  const wDays = new Set(W.map((w) => dayIdx(w.ts)).filter((d) => d >= 0));
  let wStreak = 0;
  for (let i = wDays.has(0) ? 0 : 1; wDays.has(i); i++) wStreak++;
  const wActiveDays = new Set(Wr.map((w) => startOfDay(w.ts))).size;
  const wCats = state.wCats;
  const catById: Record<string, { name: string; color: string }> = {};
  wCats.forEach((c) => (catById[c.id] = c));
  const cc: Record<string, number> = {};
  Wr.forEach((w) => {
    if (w.catId) cc[w.catId] = (cc[w.catId] || 0) + 1;
  });
  // Shades of the accent, largest first, like the spending split: a donut in
  // four unrelated hues is a legend you have to decode.
  const wTypeSegs = wCats
    .filter((c) => cc[c.id])
    .sort((a, b) => cc[b.id] - cc[a.id])
    .map((c, i) => ({ label: c.name, value: cc[c.id], color: i === 0 ? 'var(--indigo)' : `color-mix(in srgb,var(--indigo) ${shades[Math.min(i, shades.length - 1)]}%,var(--surface))` }));
  const wMinBuckets = aggSeries(Wr, buckets, (w) => w.dur || 0, 'sum');
  const wMinSeries = nums(wMinBuckets);
  const wAvg = wCount ? Math.round(wTotalMin / wCount) : 0;
  const wLongest = Wr.reduce((m, w) => Math.max(m, w.dur || 0), 0);
  const wYMax = Math.max.apply(null, wMinSeries.concat([1]));

  // ---- Sleep ----
  // A night belongs to the day you woke up on — the date it was logged under.
  const Nr = N.filter((n) => inWin(n.ts)).sort((a, b) => a.ts - b.ts);
  const slAvg = Nr.length ? Nr.reduce((s, n) => s + n.hours, 0) / Nr.length : 0;
  const slAvgQ = Nr.length ? Nr.reduce((s, n) => s + n.quality, 0) / Nr.length : 0;
  const sleepCandles = Nr.map((n) => ({ hours: n.hours, ts: n.ts, bedH: n.bedH, wakeH: n.wakeH }));
  // One slot per bucket. For a week or a month that is one night per day, with
  // a gap where nothing was logged — so three nights in a month look like
  // three nights, not like a solid run. For a year it is each month's average.
  const sleepByDay = range === 'Week' || range === 'Month';
  const sleepSlots: ({ hours: number; bedH: number | null; wakeH: number | null } | null)[] = buckets.map(() => null);
  if (sleepByDay) {
    Nr.forEach((n) => {
      const i = bucketOf(buckets, n.ts);
      if (i >= 0) sleepSlots[i] = { hours: n.hours, bedH: n.bedH, wakeH: n.wakeH };
    });
  }
  const slSeries = aggSeries(Nr, buckets, (n) => n.hours, 'avg');
  const slBest = Nr.length ? Math.max.apply(null, Nr.map((n) => n.hours)) : 0;
  const slRangeTotal = Nr.reduce((s, n) => s + n.hours, 0);
  const bedVals = Nr.filter((n) => n.bedH != null).map((n) => (n.bedH! < 12 ? n.bedH! + 24 : n.bedH!));
  const wakeVals = Nr.filter((n) => n.wakeH != null).map((n) => n.wakeH!);
  const avgBed = bedVals.length ? bedVals.reduce((a, b) => a + b, 0) / bedVals.length : null;
  const avgWake = wakeVals.length ? wakeVals.reduce((a, b) => a + b, 0) / wakeVals.length : null;
  const slCandleLabels = Nr.map((n) => {
    const dt = new Date(n.ts);
    return fmtDate(dt.getTime());
  });
  const bedDevMin =
    bedVals.length && avgBed != null
      ? (bedVals.reduce((s, b) => s + Math.abs(b - avgBed), 0) / bedVals.length) * 60
      : null;
  const slConsistGood = bedDevMin != null && bedVals.length >= 3 && bedDevMin <= 45;

  // ---- Finances ----
  const Tr = T.filter((t) => inWin(t.ts));
  const income = Tr.filter((t) => isIncome(t)).reduce((s, t) => s + t.amount, 0);
  const spent = Tr.filter((t) => isSpend(t)).reduce((s, t) => s - t.amount, 0);
  const net = income - spent;
  const catSums: Record<string, number> = {};
  Tr.filter((t) => isSpend(t)).forEach((t) => (catSums[t.cat] = (catSums[t.cat] || 0) + -t.amount));
  // A refund larger than the window's spending in its category would leave a
  // negative slice; a category with nothing spent has no place in the chart.
  const catArr = Object.keys(catSums)
    .map((k) => ({ cat: k, val: catSums[k] }))
    .filter((c) => c.val > 0)
    .sort((a, b) => b.val - a.val);
  const fCatSegs = catArr.slice(0, 4).map((c, i) => ({
    label: c.cat,
    value: c.val,
    color: i === 0 ? 'var(--indigo)' : `color-mix(in srgb,var(--indigo) ${shades[i]}%,var(--surface))`,
  }));
  // Running cash flow at the end of each bucket that has started — one point
  // per bar, not one per transaction. Per transaction, every payday drew a
  // cliff and every coffee a step, and a year of it read as a saw blade.
  const flowBuckets = aggSeries(Tr, buckets, (t) => t.amount, 'sum');
  let run = 0;
  const fTrend = flowBuckets.filter((v): v is number => v != null).map((v) => (run += v));
  if (fTrend.length < 2) fTrend.unshift(0);
  const fYMin = Math.min.apply(null, fTrend),
    fYMax = Math.max.apply(null, fTrend);
  const spendBuckets = aggSeries(Tr.filter((t) => isSpend(t)), buckets, (t) => -t.amount, 'sum');
  const incomeBuckets = aggSeries(Tr.filter((t) => isIncome(t)), buckets, (t) => t.amount, 'sum');
  const spendSeries = nums(spendBuckets);
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  // Per day over the days that have actually happened. Dividing a month's
  // spending by all 31 days on the 10th understated it threefold.
  const avgDay = spent / P.days;
  // Where the money goes, by shop rather than by category: "Talabat, 14 times"
  // says more than "Eating out". Names are grouped the way the importer groups
  // them, so "CARREFOUR MAADI" and "Carrefour" are one place.
  const placeMap = new Map<string, { name: string; total: number; count: number; cat: string }>();
  for (const t of Tr) {
    if (!isSpend(t)) continue;
    const k = merchantKey(t.name);
    if (!k || isGenericName(t.name)) continue;
    const p = placeMap.get(k) || { name: t.name, total: 0, count: 0, cat: t.cat };
    p.total -= t.amount;
    if (t.amount < 0) p.count += 1;
    placeMap.set(k, p);
  }
  const topPlaces = [...placeMap.values()]
    .filter((p) => p.total > 0 && p.name !== p.cat)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  /** Imported entries Orbit wasn't sure about, waiting for a look. */
  const reviewCount = state.txns.filter((t) => t.review).length;
  const incSums: Record<string, number> = {};
  Tr.filter((t) => isIncome(t)).forEach((t) => (incSums[t.cat] = (incSums[t.cat] || 0) + t.amount));
  const incArr = Object.keys(incSums)
    .map((k) => ({ cat: k, val: incSums[k] }))
    .sort((a, b) => b.val - a.val);

  // ---- Full finance module (month-based, independent of the range control) ----
  const mNow = monthStart(0, now),
    mPrev = monthStart(1, now);
  const spentThisMonth = T.filter((t) => isSpend(t) && t.ts >= mNow).reduce((s, t) => s - t.amount, 0);
  const spentPrevMonth = T.filter((t) => isSpend(t) && t.ts >= mPrev && t.ts < mNow).reduce((s, t) => s - t.amount, 0);
  const incThisMonth = T.filter((t) => isIncome(t) && t.ts >= mNow).reduce((s, t) => s + t.amount, 0);
  const incPrevMonth = T.filter((t) => isIncome(t) && t.ts >= mPrev && t.ts < mNow).reduce((s, t) => s + t.amount, 0);

  const catMonthSpent: Record<string, number> = {};
  T.filter((t) => isSpend(t) && t.ts >= mNow).forEach(
    (t) => (catMonthSpent[t.cat] = (catMonthSpent[t.cat] || 0) + -t.amount)
  );
  const budgets = state.budgets.map((b) => {
    const sp = catMonthSpent[b.cat] || 0;
    // Rollover: whatever went unspent last month is added to this month's limit.
    const prevStart = monthStart(1, now);
    const prevEnd = monthStart(0, now);
    const prevSpent = T.filter((t) => isSpend(t) && t.cat === b.cat && t.ts >= prevStart && t.ts < prevEnd)
      .reduce((a, t) => a - t.amount, 0);
    const carried = b.rollover ? Math.max(0, b.limit - prevSpent) : 0;
    const effLimit = b.limit + carried;
    const pct = effLimit > 0 ? Math.round((sp / effLimit) * 100) : 0;
    // `status` carries the same meaning as `color` in words, so budget health
    // isn't communicated by colour alone.
    const status = pct >= 100 ? t('Over budget') : pct >= 80 ? t('Close to limit') : t('On track');
    // Forecast: project this month's pace to month-end, so a warning arrives
    // while there's still time to act rather than after the fact.
    const nowD = new Date(now);
    const dayOfMonth = nowD.getDate();
    const daysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
    const projected = dayOfMonth > 2 ? Math.round((sp / dayOfMonth) * daysInMonth) : null;
    const willExceed = projected != null && effLimit > 0 && projected > effLimit && pct < 100;
    return { ...b, spent: sp, pct, remaining: effLimit - sp, color: budgetColor(pct), status, projected, willExceed, carried, effLimit };
  });
  const budgetTotal = budgets.reduce((s, b) => s + b.limit, 0),
    budgetSpent = budgets.reduce((s, b) => s + b.spent, 0);

  // Each account's balance, from the last balance its bank reported where there
  // is one, and from its opening balance and everything logged where not.
  // Transactions older than the state window aren't shipped as rows, so their
  // net effect comes from the archive totals; without that, a long-lived account
  // would appear to reset every time old rows aged out.
  const accSums = state.archive?.accSums || {};
  const accounts = state.accounts.map((a) => ({ ...a, balance: accountBalance(a, ALL, accSums[a.id] || 0) }));

  // Net worth at the end of each of the last six months, worked out the same
  // way, so the line ends exactly on today's total.
  const netWorthSeries: number[] = [];
  const netWorthLabels: string[] = [];
  {
    const months = 6;
    for (let i = months - 1; i >= 0; i--) {
      const cutoff = i === 0 ? now + 1 : monthStart(i - 1, now); // end of that month, or now
      netWorthSeries.push(state.accounts.reduce((sum, a) => sum + accountBalance(a, ALL, accSums[a.id] || 0, cutoff), 0));
      netWorthLabels.push(monthShort(new Date(monthStart(i, now)).getMonth()));
    }
  }
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  // A goal that follows an account moves with its balance (what the bank last
  // reported, plus anything since), not with a number typed in once.
  const goals = state.goals.map((g) => {
    const acc = g.accId ? accounts.find((a) => a.id === g.accId) : undefined;
    const current = acc ? Math.max(0, acc.balance) : g.current;
    return {
      ...g,
      current,
      followsName: acc?.name ?? null,
      pct: g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0,
    };
  });

  const recurring = [...state.recurring].sort((a, b) => (a.nextTs || 0) - (b.nextTs || 0));
  // Bills and income kept apart: summing them made a salary and the rent cancel
  // into one meaningless "monthly total".
  const perMonth = (r: { amount: number; freq: string }) =>
    Math.abs(r.freq === 'Monthly' ? r.amount : r.freq === 'Weekly' ? r.amount * 4.33 : r.freq === 'Yearly' ? r.amount / 12 : r.amount);
  const recurringMonthly = recurring.filter((r) => !r.income).reduce((s, r) => s + perMonth(r), 0);
  const recurringIncomeMonthly = recurring.filter((r) => r.income).reduce((s, r) => s + perMonth(r), 0);
  const safe = safeToSpend(
    {
      incomeThisMonth: incThisMonth,
      expectedMonthlyIncome: recurringIncomeMonthly,
      spentThisMonth,
      budgetTotal: budgets.reduce((s, b) => s + b.effLimit, 0),
      budgetSpent,
      recurring: state.recurring,
    },
    now
  );
  const topCatArr = Object.keys(catMonthSpent)
    .map((k) => ({ cat: k, val: catMonthSpent[k] }))
    .sort((a, b) => b.val - a.val);

  // ---- Counters (range-aware) ----
  const CL = state.countLogs;
  const counterRange = state.counters.map((c) => {
    let v = 0;
    CL.forEach((l) => {
      if (l.counterId === c.id && inWin(l.ts)) v += l.amount;
    });
    return { id: c.id, name: c.name, color: c.color, unit: c.unit, val: v };
  });
  const countLogsWin = CL.filter((l) => inWin(l.ts)).length;

  // ---- Activity heatmap (12 weeks) from ALL tracked events ----
  const activityGrid: number[][] = Array.from({ length: 12 }, () => new Array(7).fill(0));
  const dayCounts = new Map<number, number>();
  ([] as { ts: number }[]).concat(W, N, T, CL).forEach((x) => {
    const di = dayIdx(x.ts);
    if (di >= 0 && di < 84) {
      const k = startOfDay(x.ts);
      dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }
  });
  const maxDay = Math.max(1, ...dayCounts.values());
  const curWeek = startOfWeek(t0);
  dayCounts.forEach((count, k) => {
    const wi = Math.round(daysBetween(startOfWeek(k), curWeek) / 7);
    if (wi < 0 || wi >= 12) return;
    const col = 11 - wi;
    activityGrid[col][new Date(k).getDay()] = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / maxDay) * 4)));
  });

  // ---- Home (always this calendar week) ----
  const wk = period('Week', 0, { now });
  const wkB = wk.buckets,
    hStart = wk.start;
  const homeWorkoutBuckets = aggSeries(W.filter((w) => w.ts >= hStart), wkB, (w) => w.dur || 0, 'sum');
  const homeWorkoutSeries = nums(homeWorkoutBuckets);
  const homeWorkoutCount = W.filter((w) => w.ts >= hStart).length;
  const homeNights = N.filter((n) => n.ts >= hStart).sort((a, b) => a.ts - b.ts);
  const homeSleepData = homeNights.map((n) => n.hours);
  const homeSleepBuckets = aggSeries(homeNights, wkB, (n) => n.hours, 'avg');
  const homeSlAvg = homeNights.length ? homeNights.reduce((s, n) => s + n.hours, 0) / homeNights.length : 0;
  const homeSpendBuckets = aggSeries(T.filter((t) => isSpend(t) && t.ts >= hStart), wkB, (t) => -t.amount, 'sum');
  const homeSpendSeries = nums(homeSpendBuckets);
  // "Spent" this week (total expenses, positive number)
  const homeWeekSpend = T.filter((t) => isSpend(t) && t.ts >= hStart).reduce((s, t) => s - t.amount, 0);

  // ---- Week-over-week deltas ----
  // This week so far against the same stretch of last week — Sunday to the
  // same weekday and hour. Comparing four days with a full seven made every
  // Thursday look like a slump.
  const pStart = addDays(hStart, -7);
  const lastWeekNow = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.getTime();
  })();
  const prevWin = (ts: number) => ts >= pStart && ts < lastWeekNow;
  const prevW = W.filter((w) => prevWin(w.ts));
  const prevN = N.filter((n) => prevWin(n.ts));
  const prevSpend = T.filter((t) => isSpend(t) && prevWin(t.ts)).reduce((s, t) => s - t.amount, 0);
  const dayStart = (day: string) => new Date(day + 'T00:00:00').getTime();
  const prevChecks = state.checkins.filter((c) => {
    const t = dayStart(c.day);
    return t >= pStart && t < startOfDay(lastWeekNow) + 1;
  }).length;
  const thisChecks = state.checkins.filter((c) => {
    const t = dayStart(c.day);
    return t >= hStart && t <= t0;
  }).length;
  const prevSlAvg = prevN.length ? prevN.reduce((a, n) => a + n.hours, 0) / prevN.length : 0;
  const delta = (cur: number, before: number): number | null =>
    before === 0 ? null : Math.round(((cur - before) / before) * 100);
  const deltas = {
    workouts: delta(homeWorkoutCount, prevW.length),
    sleep: homeNights.length ? delta(homeSlAvg, prevSlAvg) : null,
    spend: delta(homeWeekSpend, prevSpend),
    habits: delta(thisChecks, prevChecks),
  };

  return {
    range,
    period: P,
    buckets,
    currentIdx,
    xLabels,
    weekBuckets: wkB,
    homeWorkoutBuckets,
    homeSpendBuckets,
    homeSleepBuckets,
    homeWorkoutSeries,
    homeWorkoutCount,
    homeSleepData,
    homeSlAvg,
    homeSpendSeries,
    homeWeekSpend,
    deltas,
    wCount,
    wTotalMin,
    wStreak,
    wActiveDays,
    wTypeSegs,
    wMinSeries,
    wMinBuckets,
    wYMax,
    wAvg,
    wLongest,
    wCats,
    catById,
    slAvg,
    slAvgQ,
    sleepCandles,
    sleepSlots,
    sleepByDay,
    slSeries,
    slCandleLabels,
    slBest,
    slRangeTotal,
    slNights: Nr.length,
    avgBed,
    avgWake,
    bedDevMin,
    slConsistGood,
    income,
    spent,
    net,
    fCatSegs,
    topPlaces,
    reviewCount,
    safe,
    fTrend,
    fYMin,
    fYMax,
    spendSeries,
    spendBuckets,
    incomeBuckets,
    savingsRate,
    avgDay,
    txnCount: Tr.length,
    incArr,
    // finance module
    spentThisMonth,
    spentPrevMonth,
    incThisMonth,
    incPrevMonth,
    catMonthSpent,
    budgets,
    netWorthSeries,
    netWorthLabels,
    budgetTotal,
    budgetSpent,
    accounts,
    netWorth,
    goals,
    recurring,
    recurringMonthly,
    recurringIncomeMonthly,
    topCatArr,
    // counters + activity
    counterRange,
    countLogsWin,
    activityGrid,
  };
}

export type Derived = ReturnType<typeof derive>;
