import type { AppState, Range } from '../types';
import { dayKey } from './format';

const D = 86400000;
const shades = [100, 72, 50, 33, 22, 15];

interface Bucket {
  label: string;
  start: number;
  end: number;
}

function sod(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function makeBuckets(range: Range, allMin: number): Bucket[] {
  const now = Date.now();
  const today = sod(now);
  const out: Bucket[] = [];
  if (range === 'Week') {
    const wk = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (let i = 6; i >= 0; i--) {
      const s = today - i * D;
      out.push({ label: wk[new Date(s).getDay()], start: s, end: s + D });
    }
    return out;
  }
  if (range === 'Month') {
    for (let i = 29; i >= 0; i--) {
      const s = today - i * D,
        dt = new Date(s);
      const lab = i === 29 || i === 0 || i % 7 === 1 ? dt.getMonth() + 1 + '/' + dt.getDate() : '';
      out.push({ label: lab, start: s, end: s + D });
    }
    return out;
  }
  if (range === 'Year') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(new Date(today).getFullYear(), new Date(today).getMonth() - i, 1);
      const e2 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ label: 'JFMAMJJASOND'[d.getMonth()], start: d.getTime(), end: e2.getTime() });
    }
    return out;
  }
  const WK = 7 * D,
    start = sod(allMin),
    weeks = Math.max(1, Math.ceil((now - start) / WK)),
    cap = Math.min(weeks, 26);
  for (let i = cap - 1; i >= 0; i--) {
    const s = today - (i + 1) * WK + D,
      en = today - i * WK + D,
      dt = new Date(s);
    const lab = i === cap - 1 || i === 0 || i % 4 === 0 ? dt.getMonth() + 1 + '/' + dt.getDate() : '';
    out.push({ label: lab, start: s, end: en });
  }
  return out;
}

function aggSeries(
  items: { ts: number }[],
  buckets: Bucket[],
  valFn: (it: any) => number,
  mode: 'sum' | 'avg'
): number[] {
  const sums = buckets.map(() => 0),
    cnts = buckets.map(() => 0);
  items.forEach((it) => {
    for (let i = 0; i < buckets.length; i++) {
      if (it.ts >= buckets[i].start && it.ts < buckets[i].end) {
        sums[i] += valFn(it);
        cnts[i]++;
        break;
      }
    }
  });
  return mode === 'avg' ? sums.map((s, i) => (cnts[i] ? s / cnts[i] : 0)) : sums;
}

function monthStart(off: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - (off || 0));
  return d.getTime();
}

function budgetColor(pct: number): string {
  return pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--emerald)';
}

/** Spending-over-time series for the Finances screen (weekly or monthly buckets). */
export function spendOverTime(txns: { ts: number; amount: number }[], mode: 'week' | 'month') {
  const now = new Date();
  const out: { label: string; value: number }[] = [];
  if (mode === 'week') {
    const today = sod(Date.now());
    for (let i = 6; i >= 0; i--) {
      const start = today - i * 7 * D + D; // rolling 7-day windows
      const s = today - (i + 1) * 7 * D + D,
        e = today - i * 7 * D + D;
      const val = txns
        .filter((t) => t.amount < 0 && t.ts >= s && t.ts < e)
        .reduce((a, t) => a - t.amount, 0);
      const dt = new Date(s);
      out.push({ label: dt.getMonth() + 1 + '/' + dt.getDate(), value: val });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const s = monthStart(i),
        e = monthStart(i - 1);
      const val = txns.filter((t) => t.amount < 0 && t.ts >= s && t.ts < e).reduce((a, t) => a - t.amount, 0);
      out.push({ label: 'JFMAMJJASOND'[new Date(s).getMonth()], value: val });
    }
  }
  return out;
}

// ----- Habit helpers, computed from real check-in history -----

function startOfWeek(ts: number): number {
  const d = new Date(sod(ts));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

// Local calendar day — must match how check-ins are keyed everywhere else.
const dayStr = dayKey;

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
  // One 0/1 per *scheduled* weekday in the current week (Sun→Sat order);
  // 1 = checked in that day, 0 = missed or still upcoming. Length equals the
  // number of days the habit is assigned per week.
  weekSlots: number[];
}

// Count scheduled vs. completed habit-days over the last `nDays` (today back).
// Anchored on Date.now() like the check-in keys, so it matches how the server
// stores days regardless of timezone. `mask` is the 7-char Sun..Sat schedule.
function scheduledStats(mask: string, set: Set<string>, nDays: number) {
  const m = /^[01]{7}$/.test(mask) ? mask : '1111111';
  const now = Date.now();
  let scheduled = 0,
    done = 0;
  for (let i = 0; i < nDays; i++) {
    const t = now - i * D;
    if (m[new Date(t).getDay()] === '1') {
      scheduled++;
      if (set.has(dayStr(t))) done++;
    }
  }
  return { scheduled, done };
}

// How many days back the selected range covers (inclusive of today).
function rangeDays(range: Range, earliestMs: number): number {
  const today = sod(Date.now());
  if (range === 'Week') return 7;
  if (range === 'Month') return 30;
  if (range === 'Year') return Math.floor((today - sod(monthStart(11))) / D) + 1;
  return Math.max(1, Math.floor((today - sod(earliestMs)) / D) + 1); // All
}

// The current week's scheduled days as 0/1, Sun→Sat; upcoming days stay 0.
function weekSlotsFor(mask: string, set: Set<string>): number[] {
  const m = /^[01]{7}$/.test(mask) ? mask : '1111111';
  const now = Date.now();
  const todayDow = new Date(now).getDay();
  const out: number[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (m[wd] !== '1') continue;
    const offset = todayDow - wd; // >0 earlier this week, 0 today, <0 upcoming
    out.push(offset >= 0 && set.has(dayStr(now - offset * D)) ? 1 : 0);
  }
  return out;
}

export function deriveHabits(state: AppState, range: Range) {
  const today = sod(Date.now());
  // Archived habits disappear from the app (history is kept); paused ones stay
  // visible but stop counting toward progress, so travel/illness can't break a run.
  const live = state.habits.filter((h) => !h.archived);
  const counted = live.filter((h) => !h.paused);
  const byHabit = new Map<string, Set<string>>();
  state.habits.forEach((h) => byHabit.set(h.id, new Set()));
  state.checkins.forEach((c) => byHabit.get(c.habitId)?.add(c.day));

  // Key off UTC day-strings (subtracting whole days in ms) so it matches exactly
  // how the server stores check-ins, regardless of the client's timezone.
  const nowMs = Date.now();
  const habits: HabitDerived[] = live.map((h) => {
    const set = byHabit.get(h.id)!;
    const done = set.has(dayStr(nowMs));
    // Current streak (kept for internal stats, no longer shown to the user).
    let streak = 0;
    let cursor = done ? nowMs : nowMs - D;
    while (set.has(dayStr(cursor))) {
      streak++;
      cursor -= D;
    }
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
      total: set.size, // total days ever completed
      streak,
      weekSlots: weekSlotsFor(h.days, set),
    };
  });

  // Longest streak across ALL habits (real, replaces the hardcoded "23 days").
  let longestStreak = 0;
  byHabit.forEach((set) => {
    const days = [...set].sort();
    let run = 0,
      prev: number | null = null;
    for (const ds of days) {
      const t = new Date(ds + 'T00:00:00').getTime();
      if (prev != null && t - prev === D) run++;
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
    const wi = Math.round((curWeek - startOfWeek(t)) / (7 * D));
    if (wi < 0 || wi >= cols) return;
    const col = cols - 1 - wi;
    const row = new Date(t).getDay();
    const ratio = count / total;
    grid[col][row] = count === 0 ? 0 : Math.min(4, Math.max(1, Math.round(ratio * 4)));
  });

  // Progress against each habit's real schedule. `range*` follows the selected
  // range (Week/Month/Year/All) for the Habits screen; `habitPct` is pinned to
  // the current week so Home and Analytics stay a stable "this week" number.
  const earliestMs = state.checkins.length
    ? Math.min(...state.checkins.map((c) => new Date(c.day + 'T00:00:00').getTime()))
    : Date.now();
  const nRange = rangeDays(range, earliestMs);
  let rangeDone = 0,
    rangeTotal = 0,
    weekDone = 0,
    weekTotal = 0;
  counted.forEach((h) => {
    const set = byHabit.get(h.id)!;
    const r = scheduledStats(h.days, set, nRange);
    rangeDone += r.done;
    rangeTotal += r.scheduled;
    const w = scheduledStats(h.days, set, 7);
    weekDone += w.done;
    weekTotal += w.scheduled;
  });
  const rangePct = rangeTotal ? Math.round((rangeDone / rangeTotal) * 100) : 0;
  const habitPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  // ---- Forgiving weekly streak ----
  // Daily streaks punish a single missed day, which is why people quit. This
  // counts *weeks* instead: a week "counts" if you completed at least 70% of
  // what you scheduled. The current (incomplete) week never breaks it.
  const GOOD = 0.7;
  const weekScore = (weekStart: number) => {
    let done = 0,
      sched = 0;
    for (let i = 0; i < 7; i++) {
      const t = weekStart + i * D;
      if (t > Date.now()) break; // ignore days that haven't happened
      const dow = new Date(t).getDay();
      const ds = dayStr(t);
      counted.forEach((h) => {
        const mask = /^[01]{7}$/.test(h.days) ? h.days : '1111111';
        if (mask[dow] !== '1') return;
        sched++;
        if (byHabit.get(h.id)?.has(ds)) done++;
      });
    }
    return { done, sched, ok: sched > 0 && done / sched >= GOOD };
  };

  const thisWeekStart = startOfWeek(today);
  let weekStreak = 0;
  // Start from last week; a good current week adds to it, a weak one doesn't break it.
  for (let w = 1; w < 104; w++) {
    const s = weekScore(thisWeekStart - w * 7 * D);
    if (!s.sched) break; // no data that far back
    if (!s.ok) break;
    weekStreak++;
  }
  const thisWeek = weekScore(thisWeekStart);
  if (thisWeek.ok) weekStreak++;
  // How many more check-ins would make the current week "count".
  const weekGoal = Math.ceil(weekTotal * GOOD);
  const weekToGo = Math.max(0, weekGoal - weekDone);

  const totalCompleted = state.checkins.length; // all-time check-ins across habits
  return {
    habits,
    longestStreak,
    totalCompleted,
    grid,
    habitPct,
    weekDone,
    weekTotal,
    weekStreak,
    weekGoal,
    weekToGo,
    weekSecured: thisWeek.ok,
    rangeDone,
    rangeTotal,
    rangePct,
  };
}

export function derive(state: AppState, range: Range) {
  const t0 = sod(Date.now());
  const dayIdx = (ts: number) => Math.floor((t0 - new Date(ts).setHours(0, 0, 0, 0)) / D);

  const W = state.workouts,
    N = state.nights,
    T = state.txns;

  const allTs = ([] as number[]).concat(W.map((x) => x.ts), N.map((x) => x.ts), T.map((x) => x.ts));
  const allMin = allTs.length ? Math.min.apply(null, allTs) : Date.now();
  const buckets = makeBuckets(range, allMin);
  const winStart = buckets[0].start,
    winEnd = buckets[buckets.length - 1].end;
  const inWin = (ts: number) => ts >= winStart && ts < winEnd;
  const xLabels = buckets.map((b) => b.label);

  // ---- Workouts ----
  const Wr = W.filter((w) => inWin(w.ts));
  const wCount = Wr.length,
    wTotalMin = Wr.reduce((s, w) => s + (w.dur || 0), 0);
  const wDays = new Set(W.map((w) => dayIdx(w.ts)).filter((d) => d >= 0));
  let wStreak = 0;
  while (wDays.has(wStreak)) wStreak++;
  const wActiveDays = new Set(Wr.map((w) => new Date(w.ts).setHours(0, 0, 0, 0))).size;
  const wCats = state.wCats;
  const catById: Record<string, { name: string; color: string }> = {};
  wCats.forEach((c) => (catById[c.id] = c));
  const cc: Record<string, number> = {};
  Wr.forEach((w) => {
    if (w.catId) cc[w.catId] = (cc[w.catId] || 0) + 1;
  });
  const wTypeSegs = wCats
    .filter((c) => cc[c.id])
    .map((c) => ({ label: c.name, value: cc[c.id], color: `var(--${c.color})` }));
  const wMinSeries = aggSeries(Wr, buckets, (w) => w.dur || 0, 'sum');
  const wAvg = wCount ? Math.round(wTotalMin / wCount) : 0;
  const wLongest = Wr.reduce((m, w) => Math.max(m, w.dur || 0), 0);
  const wYMax = Math.max.apply(null, wMinSeries.concat([1]));

  // ---- Sleep ----
  const Nr = N.filter((n) => inWin(n.ts)).sort((a, b) => a.ts - b.ts);
  const slAvg = Nr.length ? Nr.reduce((s, n) => s + n.hours, 0) / Nr.length : 0;
  const slAvgQ = Nr.length ? Nr.reduce((s, n) => s + n.quality, 0) / Nr.length : 0;
  const sleepCandles = Nr.map((n) => ({ hours: n.hours, ts: n.ts, bedH: n.bedH, wakeH: n.wakeH }));
  const slBest = Nr.length ? Math.max.apply(null, Nr.map((n) => n.hours)) : 0;
  const slRangeTotal = Nr.reduce((s, n) => s + n.hours, 0);
  const bedVals = Nr.filter((n) => n.bedH != null).map((n) => (n.bedH! < 12 ? n.bedH! + 24 : n.bedH!));
  const wakeVals = Nr.filter((n) => n.wakeH != null).map((n) => n.wakeH!);
  const avgBed = bedVals.length ? bedVals.reduce((a, b) => a + b, 0) / bedVals.length : null;
  const avgWake = wakeVals.length ? wakeVals.reduce((a, b) => a + b, 0) / wakeVals.length : null;
  const slCandleLabels = Nr.map((n) => {
    const dt = new Date(n.ts);
    return dt.getMonth() + 1 + '/' + dt.getDate();
  });
  const bedDevMin =
    bedVals.length && avgBed != null
      ? (bedVals.reduce((s, b) => s + Math.abs(b - avgBed), 0) / bedVals.length) * 60
      : null;
  const slConsistGood = bedDevMin != null && bedVals.length >= 3 && bedDevMin <= 45;

  // ---- Finances ----
  const Tr = T.filter((t) => inWin(t.ts));
  const income = Tr.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent = Tr.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const net = income - spent;
  const catSums: Record<string, number> = {};
  Tr.filter((t) => t.amount < 0).forEach((t) => (catSums[t.cat] = (catSums[t.cat] || 0) + -t.amount));
  const catArr = Object.keys(catSums)
    .map((k) => ({ cat: k, val: catSums[k] }))
    .sort((a, b) => b.val - a.val);
  const fCatSegs = catArr.slice(0, 4).map((c, i) => ({
    label: c.cat,
    value: c.val,
    color: i === 0 ? 'var(--emerald)' : `color-mix(in srgb,var(--emerald) ${shades[i]}%,var(--surface))`,
  }));
  const startBal = T.filter((t) => t.ts < winStart).reduce((s, t) => s + t.amount, 0);
  let run = startBal;
  const trAsc = [...Tr].sort((a, b) => a.ts - b.ts);
  const fTrend = trAsc.length ? trAsc.map((t) => (run += t.amount)) : [startBal, startBal];
  const fYMin = Math.min.apply(null, fTrend),
    fYMax = Math.max.apply(null, fTrend);
  const spendSeries = aggSeries(Tr.filter((t) => t.amount < 0), buckets, (t) => -t.amount, 'sum');
  const balance = T.reduce((s, t) => s + t.amount, 0);
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  const spanDays = Math.max(1, Math.round((winEnd - winStart) / D));
  const avgDay = spent / spanDays;
  const incSums: Record<string, number> = {};
  Tr.filter((t) => t.amount > 0).forEach((t) => (incSums[t.cat] = (incSums[t.cat] || 0) + t.amount));
  const incArr = Object.keys(incSums)
    .map((k) => ({ cat: k, val: incSums[k] }))
    .sort((a, b) => b.val - a.val);

  // ---- Full finance module (month-based, independent of the range control) ----
  const mNow = monthStart(0),
    mPrev = monthStart(1);
  const spentThisMonth = T.filter((t) => t.amount < 0 && t.ts >= mNow).reduce((s, t) => s - t.amount, 0);
  const spentPrevMonth = T.filter((t) => t.amount < 0 && t.ts >= mPrev && t.ts < mNow).reduce((s, t) => s - t.amount, 0);
  const incThisMonth = T.filter((t) => t.amount > 0 && t.ts >= mNow).reduce((s, t) => s + t.amount, 0);
  const incPrevMonth = T.filter((t) => t.amount > 0 && t.ts >= mPrev && t.ts < mNow).reduce((s, t) => s + t.amount, 0);

  const catMonthSpent: Record<string, number> = {};
  T.filter((t) => t.amount < 0 && t.ts >= mNow).forEach(
    (t) => (catMonthSpent[t.cat] = (catMonthSpent[t.cat] || 0) + -t.amount)
  );
  const budgets = state.budgets.map((b) => {
    const sp = catMonthSpent[b.cat] || 0;
    // Rollover: whatever went unspent last month is added to this month's limit.
    const prevStart = monthStart(1);
    const prevEnd = monthStart(0);
    const prevSpent = T.filter((t) => t.amount < 0 && t.cat === b.cat && t.ts >= prevStart && t.ts < prevEnd)
      .reduce((a, t) => a - t.amount, 0);
    const carried = b.rollover ? Math.max(0, b.limit - prevSpent) : 0;
    const effLimit = b.limit + carried;
    const pct = effLimit > 0 ? Math.round((sp / effLimit) * 100) : 0;
    // `status` carries the same meaning as `color` in words, so budget health
    // isn't communicated by colour alone.
    const status = pct >= 100 ? 'Over budget' : pct >= 80 ? 'Close to limit' : 'On track';
    // Forecast: project this month's pace to month-end, so a warning arrives
    // while there's still time to act rather than after the fact.
    const nowD = new Date();
    const dayOfMonth = nowD.getDate();
    const daysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
    const projected = dayOfMonth > 2 ? Math.round((sp / dayOfMonth) * daysInMonth) : null;
    const willExceed = projected != null && effLimit > 0 && projected > effLimit && pct < 100;
    return { ...b, spent: sp, pct, remaining: effLimit - sp, color: budgetColor(pct), status, projected, willExceed, carried, effLimit };
  });
  const budgetTotal = budgets.reduce((s, b) => s + b.limit, 0),
    budgetSpent = budgets.reduce((s, b) => s + b.spent, 0);

  // Net worth over time: opening balances plus every transaction up to each point.
  const openingTotal = state.accounts.reduce((a, x) => a + (x.opening || 0), 0);
  const sortedT = [...T].sort((a, b) => a.ts - b.ts);
  const netWorthSeries: number[] = [];
  const netWorthLabels: string[] = [];
  {
    const months = 6;
    for (let i = months - 1; i >= 0; i--) {
      const cutoff = monthStart(i - 1); // end of that month
      const bal = openingTotal + sortedT.filter((t) => t.ts < cutoff).reduce((a, t) => a + t.amount, 0);
      netWorthSeries.push(bal);
      netWorthLabels.push('JFMAMJJASOND'[new Date(monthStart(i)).getMonth()]);
    }
  }

  const accounts = state.accounts.map((a) => {
    const bal = (a.opening || 0) + T.filter((t) => t.accId === a.id).reduce((s, t) => s + t.amount, 0);
    return { ...a, balance: bal };
  });
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  const goals = state.goals.map((g) => ({
    ...g,
    pct: g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0,
  }));

  const recurring = [...state.recurring].sort((a, b) => (a.nextTs || 0) - (b.nextTs || 0));
  const recurringMonthly = recurring.reduce(
    (s, r) => s + (r.freq === 'Monthly' ? r.amount : r.freq === 'Weekly' ? r.amount * 4.33 : r.freq === 'Yearly' ? r.amount / 12 : r.amount),
    0
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
      const k = sod(x.ts);
      dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }
  });
  const maxDay = Math.max(1, ...dayCounts.values());
  const curWeek = (() => {
    const d = new Date(t0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  })();
  dayCounts.forEach((count, k) => {
    const wd = new Date(k);
    const ws = new Date(k);
    ws.setDate(ws.getDate() - ws.getDay());
    const wi = Math.round((curWeek - ws.getTime()) / (7 * D));
    if (wi < 0 || wi >= 12) return;
    const col = 11 - wi;
    activityGrid[col][wd.getDay()] = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / maxDay) * 4)));
  });

  // ---- Home (always current week) ----
  const wkB = makeBuckets('Week', allMin),
    hStart = wkB[0].start;
  const homeWorkoutSeries = aggSeries(W.filter((w) => w.ts >= hStart), wkB, (w) => w.dur || 0, 'sum');
  const homeWorkoutCount = W.filter((w) => w.ts >= hStart).length;
  const homeNights = N.filter((n) => n.ts >= hStart).sort((a, b) => a.ts - b.ts);
  const homeSleepData = homeNights.map((n) => n.hours);
  const homeSlAvg = homeNights.length
    ? homeNights.reduce((s, n) => s + n.hours, 0) / homeNights.length
    : slAvg;
  const homeSpendSeries = aggSeries(
    T.filter((t) => t.amount < 0 && t.ts >= hStart),
    wkB,
    (t) => -t.amount,
    'sum'
  );
  // "Spent" this week (total expenses, positive number)
  const homeWeekSpend = T.filter((t) => t.amount < 0 && t.ts >= hStart).reduce((s, t) => s - t.amount, 0);

  // ---- Week-over-week deltas ----
  // Compare the last 7 days with the 7 before them, so every headline stat can
  // show whether it's moving up or down. `null` = not enough history to compare.
  const pStart = hStart - 7 * D;
  const prevW = W.filter((w) => w.ts >= pStart && w.ts < hStart);
  const prevN = N.filter((n) => n.ts >= pStart && n.ts < hStart);
  const prevSpend = T.filter((t) => t.amount < 0 && t.ts >= pStart && t.ts < hStart).reduce((s, t) => s - t.amount, 0);
  const prevChecks = state.checkins.filter((c) => {
    const t = new Date(c.day + 'T12:00:00').getTime();
    return t >= pStart && t < hStart;
  }).length;
  const thisChecks = state.checkins.filter((c) => {
    const t = new Date(c.day + 'T12:00:00').getTime();
    return t >= hStart;
  }).length;
  const prevSlAvg = prevN.length ? prevN.reduce((a, n) => a + n.hours, 0) / prevN.length : 0;
  const delta = (now: number, before: number): number | null =>
    before === 0 ? null : Math.round(((now - before) / before) * 100);
  const deltas = {
    workouts: delta(homeWorkoutCount, prevW.length),
    sleep: delta(homeSlAvg, prevSlAvg),
    spend: delta(homeWeekSpend, prevSpend),
    habits: delta(thisChecks, prevChecks),
  };

  return {
    range,
    xLabels,
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
    wYMax,
    wAvg,
    wLongest,
    wCats,
    catById,
    slAvg,
    slAvgQ,
    sleepCandles,
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
    fTrend,
    fYMin,
    fYMax,
    spendSeries,
    balance,
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
    topCatArr,
    // counters + activity
    counterRange,
    countLogsWin,
    activityGrid,
  };
}

export type Derived = ReturnType<typeof derive>;
