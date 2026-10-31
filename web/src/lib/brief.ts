import type { AppState } from '../types';
import { dayKey } from './format';
import { addDays, startOfDay } from './period';
import { isSpend } from './money';
import { missedRun } from './comeback';
import { merchantKey, isGenericName } from './merchants';
import { currentIntention } from './weekReview';
import { buildInsights } from './insights';
import { enabled } from './modules';
import { t, tn } from '../i18n';

// The morning brief.
//
// One short page to read with the first coffee: how last night went, what's
// on today, where the money stands, and one thing worth noticing. It's built
// fresh from what's already logged each time it's opened, so it's never stale,
// and it only says things that are true and useful this morning. A section
// with nothing to say isn't shown, rather than shown empty.
//
// A notification at the chosen time says it's ready; Home offers it until it's
// been read or the morning is over. Both are this phone's settings, like the
// app lock, because a brief belongs to the phone someone wakes up to.

const D = 86_400_000;

export interface Brief {
  day: string;
  /** Last night, when it's been logged. */
  sleep: { hours: number; quality: number; bedH: number | null; diffMin: number | null } | null;
  /** Logs sleep at all, so a missing night is worth a prompt. */
  sleepTracked: boolean;
  /** Today's planned habits, in the user's order: the same list as Home's. */
  habits: { id: string; name: string; cue: string | null; done: boolean }[];
  /** A habit missed last time and planned again today: "don't miss it twice". */
  slip: { id: string; name: string; why: string | null } | null;
  spentYesterday: number;
  /** Where most of yesterday's money went, when there's a real name for it. */
  topYesterday: string | null;
  /** Bills due today and in the next three days. */
  bills: { name: string; amount: number; inDays: number }[];
  /** Budgets at 80% or more of this month's limit. */
  budgetsNear: { cat: string; pct: number }[];
  safe: { left: number; perDay: number; daysLeft: number } | null;
  toReview: number;
  training: { lastName: string; daysSince: number; lastWeek: number; usual: number | null } | null;
  intention: string | null;
  insight: { title: string; detail: string } | null;
}

/** The parts already worked out for Finances, passed in rather than recomputed. */
export interface BriefMoney {
  safe: { left: number; perDay: number; daysLeft: number } | null;
  budgets: { cat: string; pct: number }[];
  reviewCount: number;
}

const due = (days: string, ts: number) => ((/^[01]{7}$/.test(days) ? days : '1111111')[new Date(ts).getDay()] === '1');

export function buildBrief(state: AppState, money: BriefMoney, now: number = Date.now()): Brief {
  const today = dayKey(now);
  const start = startOfDay(now);
  const yesterday = dayKey(addDays(now, -1));
  const on = (k: string) => enabled(state, k);

  // Sleep: the night that ended this morning, against the two weeks before.
  let sleep: Brief['sleep'] = null;
  const nights = [...state.nights].sort((a, b) => b.ts - a.ts);
  const last = nights.find((n) => dayKey(n.ts) === today);
  if (last && on('sleep')) {
    const before = nights.filter((n) => n.ts < start && n.ts >= start - 14 * D);
    const avg = before.length >= 3 ? before.reduce((s, n) => s + n.hours, 0) / before.length : null;
    const diff = avg == null ? null : Math.round(((last.hours - avg) * 60) / 5) * 5;
    sleep = { hours: last.hours, quality: last.quality, bedH: last.bedH, diffMin: diff != null && Math.abs(diff) >= 15 ? diff : null };
  }
  const sleepTracked = on('sleep') && nights.some((n) => n.ts >= start - 14 * D);

  // Habits planned for today.
  const live = on('habits') ? state.habits.filter((h) => !h.paused && !h.archived && due(h.days, now)) : [];
  const doneToday = new Set(state.checkins.filter((c) => c.day === today).map((c) => c.habitId));
  const habits = live.map((h) => ({ id: h.id, name: h.name, cue: h.cue || null, done: doneToday.has(h.id) }));
  const slipH = live
    .filter((h) => !doneToday.has(h.id))
    .find((h) => missedRun(h.days, new Set(state.checkins.filter((c) => c.habitId === h.id).map((c) => c.day)), now) === 1);
  const slip = slipH ? { id: slipH.id, name: slipH.name, why: slipH.why || null } : null;

  // Money.
  const fin = on('finances');
  let spentYesterday = 0;
  const places = new Map<string, { name: string; total: number }>();
  if (fin) {
    for (const x of state.txns) {
      if (x.toAccId || x.adjust || !isSpend(x) || dayKey(x.ts) !== yesterday) continue;
      spentYesterday -= x.amount;
      const k = merchantKey(x.name);
      if (!k || x.name === x.cat || isGenericName(x.name)) continue;
      const p = places.get(k) || { name: x.name, total: 0 };
      p.total -= x.amount;
      places.set(k, p);
    }
  }
  const top = [...places.values()].sort((a, b) => b.total - a.total)[0];
  // Only worth naming when it was most of the day's spending.
  const topYesterday = top && spentYesterday > 0 && top.total >= spentYesterday * 0.4 ? top.name : null;
  const bills = fin
    ? state.recurring
        .filter((r) => !r.income && r.nextTs && r.nextTs >= start && r.nextTs < start + 4 * D)
        .map((r) => ({ name: r.name, amount: Math.abs(r.amount), inDays: Math.round((startOfDay(r.nextTs!) - start) / D) }))
        .sort((a, b) => a.inDays - b.inDays || b.amount - a.amount)
        .slice(0, 4)
    : [];
  const budgetsNear = fin ? money.budgets.filter((b) => b.pct >= 80).sort((a, b) => b.pct - a.pct) : [];

  // Training: when the last one was, and how this week compares with usual.
  let training: Brief['training'] = null;
  if (on('workouts')) {
    const past = state.workouts.filter((w) => w.ts < now).sort((a, b) => b.ts - a.ts);
    if (past.length) {
      const lastWeek = past.filter((w) => w.ts >= start - 6 * D).length;
      const older = past.filter((w) => w.ts < start - 6 * D && w.ts >= start - 62 * D).length;
      const span = Math.min(8, Math.max(1, Math.floor((start - 6 * D - Math.min(...past.map((w) => w.ts))) / (7 * D))));
      const usual = older ? Math.round(older / span) : null;
      training = { lastName: past[0].name, daysSince: Math.round((start - startOfDay(past[0].ts)) / D), lastWeek, usual };
    }
  }

  // One finding, a different one each day when there are several.
  let insight: Brief['insight'] = null;
  try {
    const all = buildInsights(state).filter((i) => i.kind !== 'alert');
    if (all.length) {
      let h = 0;
      for (const c of today) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const pick = all[h % all.length];
      insight = { title: pick.title, detail: pick.detail };
    }
  } catch {
    /* an insight is a bonus; the brief stands without it */
  }

  return {
    day: today,
    sleep,
    sleepTracked,
    habits,
    slip,
    spentYesterday: Math.round(spentYesterday),
    topYesterday,
    bills,
    budgetsNear,
    safe: fin && money.safe && money.safe.left > 0 ? money.safe : null,
    toReview: fin ? money.reviewCount : 0,
    training,
    intention: currentIntention(now),
    insight,
  };
}

/** Whether there's anything at all to brief on. A new account has nothing yet. */
export function hasBriefData(state: AppState): boolean {
  return state.checkins.length > 0 || state.txns.length > 0 || state.nights.length > 0 || state.workouts.length > 0;
}

// ---------------------------------------------------------------------------
// The notification's line, written ahead for a given morning. Only what can be
// known the night before goes in it: the habits planned that day and a bill
// due that day. Sleep and spending are the brief's job.

export function briefTeaser(state: AppState, morning: number): { bill: string | null; habits: number } {
  const start = startOfDay(morning);
  const bill = enabled(state, 'finances')
    ? state.recurring.find((r) => !r.income && r.nextTs && r.nextTs >= start && r.nextTs < start + D)?.name ?? null
    : null;
  const habits = enabled(state, 'habits')
    ? state.habits.filter((h) => !h.paused && !h.archived && due(h.days, morning)).length
    : 0;
  return { bill, habits };
}

/** The notification's words for one morning. */
export function teaserLine(state: AppState, morning: number): string {
  const x = briefTeaser(state, morning);
  if (x.bill) return t('{name} is due today. Your brief has the rest.', { name: x.bill });
  if (x.habits) return tn(x.habits, 'One habit on today’s list, plus last night and your money.', '{n} habits on today’s list, plus last night and your money.');
  return t('Last night, today’s plan and your money, in a minute.');
}

/**
 * The mornings to notify, from now through the next two weeks. Today's is left
 * out once its time has passed or the brief has already been read.
 */
export function briefSchedule(state: AppState, prefs: BriefPrefs = briefPrefs(), now: number = Date.now()): { at: Date; body: string }[] {
  if (!prefs.on || !hasBriefData(state)) return [];
  const [h, m] = prefs.time.split(':').map(Number);
  const out: { at: Date; body: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(h, m, 0, 0);
    if (at.getTime() <= now + 60_000) continue;
    if (i === 0 && briefRead(now)) continue;
    out.push({ at, body: teaserLine(state, at.getTime()) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// This phone's settings, and whether today's brief has been read.

const PREF_KEY = 'orbit_brief';
const READ_KEY = 'orbit_brief_read';

export interface BriefPrefs {
  on: boolean;
  /** "HH:MM", local time. */
  time: string;
}
export const DEFAULT_BRIEF: BriefPrefs = { on: true, time: '08:00' };

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* without storage the defaults apply, which is fine */
  }
};

export function briefPrefs(): BriefPrefs {
  try {
    const v = JSON.parse(get(PREF_KEY) || 'null');
    if (v && typeof v.on === 'boolean' && /^\d{2}:\d{2}$/.test(v.time)) return v;
  } catch {
    /* fall through */
  }
  return DEFAULT_BRIEF;
}
export const setBriefPrefs = (p: BriefPrefs) => put(PREF_KEY, JSON.stringify(p));

export const markBriefRead = (now: number = Date.now()) => put(READ_KEY, dayKey(now));
export const briefRead = (now: number = Date.now()) => get(READ_KEY) === dayKey(now);

/**
 * Home offers the brief from the chosen time (or 4 a.m., if that's earlier
 * than someone wakes) until 3 p.m., once a day. After that it's no longer a
 * morning brief, and an unread card all evening would only nag.
 */
export function briefDue(now: number = Date.now(), prefs: BriefPrefs = briefPrefs()): boolean {
  if (!prefs.on || briefRead(now)) return false;
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const [h, m] = prefs.time.split(':').map(Number);
  return mins >= Math.min(h * 60 + m, 4 * 60) && mins < 15 * 60;
}
