import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppState, Habit, StepDay } from '../types';
import { api, API_BASE, getToken } from '../api';
import { dayKey } from './format';
import { addDays, startOfDay } from './period';
import { healthPrefs, healthSupported, mainStepSource, readDailySteps } from './health';
import { getDigits, getLang, t } from '../i18n';

// Steps, from whichever app counts them (Samsung Health, Google Fit, Fitbit…),
// by way of Health Connect, which merges them so nothing is counted twice.
//
// Each day's total goes to the server, which ticks the Steps habit the day it
// reaches the goal. While the app is closed a small Android job
// (StepsWorker.kt) checks every 15 minutes, sends a notification at 25%, 50%
// and 75% of the goal and a congratulations at 100%, and reports a reached
// goal to the server, so the habit is ticked even if Orpit isn't opened that day.

/** The Steps habit, if the person has it. */
export const stepsHabit = (s: AppState): Habit | undefined => s.habits.find((h) => h.auto === 'steps' && !h.archived);

/** Steps counted on a day (YYYY-MM-DD), if any were synced. */
export const stepsOn = (s: AppState, day: string): StepDay | undefined => s.steps?.find((x) => x.day === day);

/** The last `n` days, oldest first, with 0 where nothing was counted. */
export function lastDays(s: AppState, n: number, now = Date.now()): { day: string; ts: number; count: number }[] {
  const by = new Map((s.steps || []).map((x) => [x.day, x.count]));
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => {
    const ts = addDays(today, i - n + 1);
    const day = dayKey(ts);
    return { day, ts, count: by.get(day) ?? 0 };
  });
}

/** The quarter of the goal reached: 0, 25, 50, 75 or 100. */
export function milestoneOf(steps: number, goal: number): 0 | 25 | 50 | 75 | 100 {
  if (!goal || goal <= 0) return 0;
  const p = steps / goal;
  return p >= 1 ? 100 : p >= 0.75 ? 75 : p >= 0.5 ? 50 : p >= 0.25 ? 25 : 0;
}

/** The goal a new Steps habit starts with (the server's default too). */
export const STEP_GOAL = 8000;

/** Goals people pick from; any other number set elsewhere still shows. */
export const GOAL_PRESETS = [5000, 6000, 8000, 10000, 12000];

// ---------------------------------------------------------------------------
// This phone's settings.

const KEY = 'orbit_steps';
export interface StepPrefs {
  lastSync: number | null;
  /** Notifications at 25/50/75/100%. On unless turned off. */
  notify: boolean;
}
export function stepPrefs(): StepPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { lastSync: typeof v.lastSync === 'number' ? v.lastSync : null, notify: v.notify !== false };
  } catch {
    /* fall through */
  }
  return { lastSync: null, notify: true };
}
export function setStepPrefs(p: Partial<StepPrefs>): StepPrefs {
  const next = { ...stepPrefs(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* lasts until the app closes */
  }
  return next;
}

/** Steps change by the minute; opening the app should show the latest. */
export const stepsDue = (now = Date.now(), p = stepPrefs()): boolean => healthPrefs().on && (!p.lastSync || now - p.lastSync > 2 * 60_000);

/**
 * Read each day's steps and send them. The first sync reaches back 30 days
 * (the chart has something to show at once); later ones resend the last few
 * days, because a watch can sync hours late.
 */
export async function syncSteps(now = Date.now()): Promise<{ state: AppState; ticked: string[]; today: number } | null> {
  if (!healthPrefs().on || !healthSupported()) return null;
  const p = stepPrefs();
  const today = startOfDay(now);
  const start = p.lastSync ? Math.max(addDays(today, -30), addDays(startOfDay(p.lastSync), -2)) : addDays(today, -30);
  const [daily, source] = await Promise.all([readDailySteps(start, now), mainStepSource(today, now)]);
  const days = daily.map((d) => ({ day: dayKey(d.day), count: d.count, source: dayKey(d.day) === dayKey(today) ? source : null }));
  if (!days.length) {
    setStepPrefs({ lastSync: now });
    return null;
  }
  const r = await api.syncSteps(days);
  setStepPrefs({ lastSync: now });
  const { ticked = [], ...state } = r;
  return { state: state as AppState, ticked, today: days.find((d) => d.day === dayKey(today))?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// The Android side: the background check and its notifications.

interface OrbitStepsPlugin {
  configure(o: {
    enabled: boolean;
    goal: number;
    apiBase: string;
    token: string | null;
    locale: string;
    texts: Record<'m25' | 'm50' | 'm75' | 'm100', { title: string; body: string }>;
  }): Promise<void>;
  /** Record a count seen in the app. Returns a milestone newly reached (0 if none), without a notification. */
  report(o: { day: string; steps: number; goal: number }): Promise<{ milestone: number }>;
  backgroundStatus(): Promise<{ available: boolean; granted: boolean }>;
  requestBackground(): Promise<{ granted: boolean }>;
}
const Native = registerPlugin<OrbitStepsPlugin>('OrbitSteps');
const native = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** What each notification says, in the reader's language. {steps}, {goal} and {left} are filled in on the phone. */
export function alertTexts() {
  return {
    m25: { title: t('A quarter of your steps'), body: t('{steps} so far today. {left} to go.') },
    m50: { title: t('Halfway to {goal} steps'), body: t('{steps} done. Keep it going.') },
    m75: { title: t('Three quarters there'), body: t('{left} steps left. A short walk finishes it.') },
    m100: { title: t('You hit your step goal 🎉'), body: t('{steps} steps today, and your Steps habit is done.') },
  };
}

let lastConfig = '';
/**
 * Tell the background check what to do: on when the health app is connected,
 * the person has the Steps habit and hasn't turned the notifications off.
 * Called whenever any of that might have changed; only a change goes through.
 */
export function configureStepAlerts(s: AppState | null): void {
  if (!native()) return;
  const h = s ? stepsHabit(s) : undefined;
  const token = s ? getToken() : null;
  const enabled = !!(s && h && h.goal && !h.paused && healthPrefs().on && stepPrefs().notify && token);
  const locale = getLang() === 'ar' ? (getDigits() === 'arab' ? 'ar-EG' : 'ar-EG-u-nu-latn') : 'en-US';
  const cfg = { enabled, goal: h?.goal || 0, apiBase: API_BASE, token, locale, texts: alertTexts() };
  const key = JSON.stringify(cfg);
  if (key === lastConfig) return;
  lastConfig = key;
  Native.configure(cfg).catch(() => {
    lastConfig = '';
  });
}

/** A count seen in the app: the milestone it just reached (shown as a toast), or 0. */
export async function reportSteps(day: string, steps: number, goal: number): Promise<number> {
  if (!native() || !goal) return 0;
  try {
    return (await Native.report({ day, steps, goal })).milestone || 0;
  } catch {
    return 0;
  }
}

/** Whether this phone lets Orpit read steps while it's closed, and whether it's allowed. */
export async function backgroundStatus(): Promise<{ available: boolean; granted: boolean }> {
  if (!native()) return { available: false, granted: false };
  try {
    return await Native.backgroundStatus();
  } catch {
    return { available: false, granted: false };
  }
}

export async function requestBackground(): Promise<boolean> {
  if (!native()) return false;
  try {
    return (await Native.requestBackground()).granted;
  } catch {
    return false;
  }
}

/** The toast for a milestone reached while the app is open. */
export function milestoneToast(m: number, steps: number, goal: number, fmt: (n: number) => string): string | null {
  if (m === 100) return t('Step goal reached 🎉 {steps} steps today.', { steps: fmt(steps) });
  if (m === 75) return t('Three quarters of your steps. {left} to go.', { left: fmt(Math.max(0, goal - steps)) });
  if (m === 50) return t('Halfway to your step goal.');
  if (m === 25) return t('A quarter of your step goal done.');
  return null;
}
