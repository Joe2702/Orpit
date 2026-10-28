import type { AppState } from '../types';
import { dayKey } from './format';
import { addDays, startOfDay } from './period';
import { isSpend } from './money';
import { merchantKey, isGenericName } from './merchants';

// A week, looked back on in a minute.
//
// The Sunday notification used to say "your week in review is ready" and open
// the app on whatever screen it was last on. A review is a small ritual: see
// what happened, settle what's unsettled, choose one thing for next week. Doing
// it weekly is what keeps a tracker from becoming a pile of entries nobody
// looks at, and choosing one concrete thing is what turns looking into doing.

export interface WeekSummary {
  from: number;
  to: number;
  spent: number;
  spentBefore: number;
  topPlaces: { name: string; total: number }[];
  topCat: string | null;
  habitDone: number;
  habitPlanned: number;
  /** The habit done least often against its plan, if any fell short. */
  weakestHabit: string | null;
  workouts: number;
  avgSleep: number | null;
}

export function summariseWeek(state: AppState, now: number = Date.now()): WeekSummary {
  const to = now;
  const from = startOfDay(addDays(now, -6));
  const prevFrom = addDays(from, -7);
  const inWeek = (ts: number) => ts >= from && ts <= to;
  const spendOf = (lo: number, hi: number) =>
    state.txns.filter((t) => !t.toAccId && !t.adjust && isSpend(t) && t.ts >= lo && t.ts < hi).reduce((s, t) => s - t.amount, 0);

  const places = new Map<string, { name: string; total: number }>();
  const cats = new Map<string, number>();
  for (const t of state.txns) {
    if (t.toAccId || t.adjust || !isSpend(t) || !inWeek(t.ts)) continue;
    cats.set(t.cat, (cats.get(t.cat) || 0) - t.amount);
    const k = merchantKey(t.name);
    if (!k || t.name === t.cat || isGenericName(t.name)) continue;
    const p = places.get(k) || { name: t.name, total: 0 };
    p.total -= t.amount;
    places.set(k, p);
  }

  let habitDone = 0;
  let habitPlanned = 0;
  let weakest: { name: string; rate: number } | null = null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  for (const h of state.habits) {
    if (h.archived || h.paused || h.locked) continue;
    const done = new Set(state.checkins.filter((c) => c.habitId === h.id).map((c) => c.day));
    const mask = h.days && h.days.length === 7 ? h.days : '1111111';
    let planned = 0;
    let did = 0;
    for (const d of days) {
      if (mask[new Date(d).getDay()] !== '1') continue;
      planned++;
      if (done.has(dayKey(d))) did++;
    }
    habitPlanned += planned;
    habitDone += did;
    const rate = planned ? did / planned : 1;
    if (planned && rate < 1 && (!weakest || rate < weakest.rate)) weakest = { name: h.name, rate };
  }

  const nights = state.nights.filter((n) => inWeek(n.ts));
  return {
    from,
    to,
    spent: Math.round(spendOf(from, to + 1)),
    spentBefore: Math.round(spendOf(prevFrom, from)),
    topPlaces: [...places.values()].filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 3),
    topCat: [...cats.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    habitDone,
    habitPlanned,
    weakestHabit: weakest?.name ?? null,
    workouts: state.workouts.filter((w) => inWeek(w.ts)).length,
    avgSleep: nights.length ? Math.round((nights.reduce((s, n) => s + n.hours, 0) / nights.length) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// When it's offered, and the one thing chosen for the week after.

const DONE_KEY = 'orbit_review_done';
const INTENT_KEY = 'orbit_intention';

/**
 * The weekend a review belongs to: the Saturday that opened it. Offered from
 * Saturday noon until the end of Monday, once.
 */
export function reviewWindow(now: number = Date.now()): string | null {
  const d = new Date(now);
  const back = (d.getDay() + 1) % 7; // days since Saturday
  const sat = startOfDay(addDays(now, -back));
  if (back === 0 && d.getHours() < 12) return null;
  if (back > 2) return null;
  return dayKey(sat);
}

const get = (k: string) => {
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
    /* not kept: offered again, which is harmless */
  }
};

export const reviewDue = (now: number = Date.now()): boolean => {
  const w = reviewWindow(now);
  return !!w && get(DONE_KEY) !== w;
};

export function finishReview(intention: string | null, now: number = Date.now()) {
  const w = reviewWindow(now);
  if (w) put(DONE_KEY, w);
  if (intention && intention.trim()) put(INTENT_KEY, JSON.stringify({ text: intention.trim().slice(0, 120), until: addDays(startOfDay(now), 8) }));
}

/** The one thing chosen for this week, while the week lasts. */
export function currentIntention(now: number = Date.now()): string | null {
  try {
    const v = JSON.parse(get(INTENT_KEY) || 'null');
    return v && typeof v.text === 'string' && now < v.until ? v.text : null;
  } catch {
    return null;
  }
}
