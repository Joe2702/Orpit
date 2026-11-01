import { Capacitor } from '@capacitor/core';
import type { HealthSample, Workout as HcWorkout, SleepStage, HealthPlugin } from '@capgo/capacitor-health';
import { api } from '../api';
import type { AppState } from '../types';

// Sleep and workouts from Health Connect.
//
// Fitbit (and Samsung Health, Google Fit, Garmin…) save sleep and exercise to
// Health Connect on the phone. With the person's permission Orbit reads them
// from there and saves them as its own nights and workouts, so nothing gets
// logged twice. Orbit only reads: it never writes to Health Connect.
//
// Each entry keeps its Health Connect id, so syncing the same week again adds
// nothing (the server checks), a night or workout already logged by hand wins,
// and one the person deletes stays deleted.

const D = 86_400_000;

export interface ImportNight {
  extId: string;
  source: string;
  hours: number;
  quality: number;
  bedH: number;
  wakeH: number;
  ts: number;
}
export interface ImportWorkout {
  extId: string;
  source: string;
  name: string;
  catId: string | null;
  dur: number;
  dist: string | null;
  kcal: number | null;
  ts: number;
}

/** The app that wrote a record, by name rather than package. */
export function sourceLabel(pkg?: string | null): string {
  const p = (pkg || '').toLowerCase();
  if (p.includes('fitbit')) return 'Fitbit';
  if (p.includes('com.google.android.apps.fitness')) return 'Google Fit';
  if (p.includes('shealth') || p.includes('samsung')) return 'Samsung Health';
  if (p.includes('garmin')) return 'Garmin';
  if (p.includes('strava')) return 'Strava';
  if (p.includes('huawei')) return 'Huawei Health';
  if (p.includes('xiaomi') || p.includes('mi.health') || p.includes('mifit')) return 'Mi Fitness';
  if (p.includes('oura')) return 'Oura';
  if (p.includes('whoop')) return 'Whoop';
  return 'Health Connect';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ASLEEP = ['asleep', 'light', 'deep', 'rem'];
const minutesIn = (stages: SleepStage[], kinds: string[]) => stages.filter((s) => kinds.includes(s.stage)).reduce((a, s) => a + (s.durationMinutes || 0), 0);

/**
 * Health Connect has no quality score, and Orbit's nights carry one, so it's
 * estimated from what the tracker measured: enough sleep (7–9 hours), how
 * little of the night was spent awake, and how much was deep or REM sleep.
 * Without stages, length alone sets it, and modestly. Editing the night
 * replaces it.
 */
export function estimateQuality(asleepMin: number, stages: SleepStage[] = []): number {
  const h = asleepMin / 60;
  const length = h >= 7 && h <= 9 ? 1 : h < 7 ? clamp((h - 4) / 3, 0, 1) : clamp(1 - (h - 9) / 3, 0.6, 1);
  const awake = minutesIn(stages, ['awake']);
  const asleep = minutesIn(stages, ASLEEP);
  const restorative = minutesIn(stages, ['deep', 'rem']);
  if (!asleep) return clamp(Math.round(3 + 6 * length), 1, 10);
  const efficiency = clamp((asleep / (asleep + awake) - 0.75) / 0.2, 0, 1);
  // Trackers that only say "asleep" give no deep/REM split: lean on the rest.
  const depth = restorative ? clamp(restorative / asleep / 0.4, 0, 1) : length;
  return clamp(Math.round(1 + 9 * (0.45 * length + 0.3 * efficiency + 0.25 * depth)), 1, 10);
}

const hourOf = (ms: number) => {
  const d = new Date(ms);
  return Math.round((d.getHours() + d.getMinutes() / 60) * 4) / 4;
};

/**
 * A Health Connect sleep session as an Orbit night. Naps (under three hours
 * asleep) are left out: a night's average shouldn't count an afternoon doze.
 */
export function nightFrom(s: HealthSample): ImportNight | null {
  if (!s.platformId) return null;
  const start = Date.parse(s.startDate);
  const end = Date.parse(s.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const stages = s.stages || [];
  const staged = minutesIn(stages, ASLEEP);
  const asleepMin = staged || (end - start) / 60_000;
  if (asleepMin < 180) return null;
  return {
    extId: `hc:${s.platformId}`,
    source: sourceLabel(s.sourceName || s.sourceId),
    hours: Math.round((asleepMin / 60) * 100) / 100,
    quality: estimateQuality(asleepMin, stages),
    bedH: hourOf(start),
    wakeH: hourOf(end),
    ts: end,
  };
}

// What each kind of exercise is called in Orbit, and words that find the
// person's own category for it ("Run", "Cycling", "Football"…).
const KINDS: { types: string[]; name: string; keys: string[] }[] = [
  { types: ['running', 'runningTreadmill', 'trackAndField'], name: 'Run', keys: ['run', 'jog'] },
  { types: ['walking'], name: 'Walk', keys: ['walk'] },
  { types: ['hiking'], name: 'Hike', keys: ['hike', 'hiking', 'walk'] },
  { types: ['cycling', 'bikingStationary', 'handCycling'], name: 'Cycling', keys: ['cycl', 'bike', 'ride', 'spin'] },
  { types: ['swimming', 'swimmingPool', 'swimmingOpenWater'], name: 'Swim', keys: ['swim'] },
  {
    types: ['strengthTraining', 'traditionalStrengthTraining', 'functionalStrengthTraining', 'weightlifting', 'calisthenics', 'coreTraining', 'benchPress', 'deadlift', 'latPullDown', 'barbellShoulderPress', 'lunge', 'plank'],
    name: 'Strength training',
    keys: ['strength', 'weight', 'lift', 'gym'],
  },
  { types: ['highIntensityIntervalTraining', 'crossTraining', 'bootCamp', 'mixedCardio', 'exerciseClass', 'burpee', 'jumpingJack'], name: 'HIIT', keys: ['hiit', 'circuit', 'cross'] },
  { types: ['yoga'], name: 'Yoga', keys: ['yoga'] },
  { types: ['pilates'], name: 'Pilates', keys: ['pilates'] },
  { types: ['stretching', 'flexibility', 'cooldown'], name: 'Stretching', keys: ['stretch', 'mobility'] },
  { types: ['elliptical'], name: 'Elliptical', keys: ['elliptical', 'cardio'] },
  { types: ['rowing', 'rowingMachine'], name: 'Rowing', keys: ['row'] },
  { types: ['soccer', 'americanFootball', 'australianFootball'], name: 'Football', keys: ['football', 'soccer', 'five'] },
  { types: ['basketball'], name: 'Basketball', keys: ['basket'] },
  { types: ['tennis', 'tableTennis', 'squash', 'badminton', 'racquetball', 'pickleball'], name: 'Racket sports', keys: ['tennis', 'squash', 'padel', 'badminton', 'racket'] },
  { types: ['boxing', 'kickboxing', 'martialArts', 'wrestling'], name: 'Boxing', keys: ['box', 'martial', 'fight', 'mma'] },
  { types: ['dance', 'cardioDance', 'socialDance', 'dancing'], name: 'Dance', keys: ['dance'] },
  { types: ['stairClimbing', 'stairClimbingMachine', 'stairs', 'stepTraining'], name: 'Stairs', keys: ['stair', 'step'] },
];

/** Every name an import can carry, for the Arabic dictionary. */
export const IMPORT_NAMES = [...KINDS.map((k) => k.name), 'Workout'];

/** A Health Connect exercise session as an Orbit workout. */
export function workoutFrom(w: HcWorkout, cats: { id: string; name: string }[]): ImportWorkout | null {
  if (!w.platformId) return null;
  const start = Date.parse(w.startDate);
  const dur = Math.round((w.duration || 0) / 60);
  if (!Number.isFinite(start) || dur < 5) return null;
  const kind = KINDS.find((k) => k.types.includes(w.workoutType));
  const cat = kind ? cats.find((c) => kind.keys.some((key) => c.name.toLowerCase().includes(key))) : undefined;
  return {
    extId: `hc:${w.platformId}`,
    source: sourceLabel(w.sourceName || w.sourceId),
    name: kind?.name ?? 'Workout',
    catId: cat?.id ?? null,
    dur,
    dist: w.totalDistance && w.totalDistance >= 100 ? `${(w.totalDistance / 1000).toFixed(1)} km` : null,
    kcal: w.totalEnergyBurned && w.totalEnergyBurned > 0 ? Math.round(w.totalEnergyBurned) : null,
    ts: start,
  };
}

/**
 * When two apps saved the same session (Fitbit and Google Fit both have the
 * run), the server keeps the first and skips the overlap, so Fitbit goes first.
 */
const rank = (s: string) => (s === 'Fitbit' ? 0 : s === 'Health Connect' ? 2 : 1);
export const bySource = <T extends { source: string; ts: number }>(a: T, b: T) => rank(a.source) - rank(b.source) || a.ts - b.ts;

// ---------------------------------------------------------------------------
// This phone's setting, and the plugin.

const KEY = 'orbit_health';
export interface HealthPrefs {
  on: boolean;
  lastSync: number | null;
}
export function healthPrefs(): HealthPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.on === 'boolean') return { on: v.on, lastSync: typeof v.lastSync === 'number' ? v.lastSync : null };
  } catch {
    /* fall through */
  }
  return { on: false, lastSync: null };
}
export function setHealthPrefs(p: HealthPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* off until next time, which is safe */
  }
}

// The plugin object is a Proxy that answers any property, `then` included, so
// it's never handed straight out of an async function (see LN() in notify.ts).
async function plugin(): Promise<{ h: HealthPlugin }> {
  const m = await import('@capgo/capacitor-health');
  return { h: m.Health };
}

export const healthSupported = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** Whether Health Connect is on this phone and ready. */
export async function healthAvailable(): Promise<{ ok: boolean; reason?: string }> {
  if (!healthSupported()) return { ok: false };
  try {
    const { h } = await plugin();
    const r = await h.isAvailable();
    return { ok: r.available, reason: r.reason };
  } catch {
    return { ok: false };
  }
}

const READ = ['sleep', 'workouts', 'distance', 'calories', 'totalCalories'] as const;

/** Ask Health Connect for permission. Returns what was allowed. */
export async function connectHealth(): Promise<{ sleep: boolean; workouts: boolean }> {
  const { h } = await plugin();
  const r = await h.requestAuthorization({ read: [...READ] });
  return { sleep: r.readAuthorized.includes('sleep'), workouts: r.readAuthorized.includes('workouts') };
}

export async function healthGranted(): Promise<{ sleep: boolean; workouts: boolean }> {
  try {
    const { h } = await plugin();
    const r = await h.checkAuthorization({ read: [...READ] });
    return { sleep: r.readAuthorized.includes('sleep'), workouts: r.readAuthorized.includes('workouts') };
  } catch {
    return { sleep: false, workouts: false };
  }
}

export async function openHealthSettings(): Promise<void> {
  try {
    const { h } = await plugin();
    await h.openHealthConnectSettings();
  } catch {
    // Not installed: its Play Store page is where to get it.
    window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata', '_system');
  }
}

/** Synced recently enough that opening the app again needn't. */
export const syncDue = (now: number = Date.now(), p: HealthPrefs = healthPrefs()): boolean =>
  p.on && (!p.lastSync || now - p.lastSync > 15 * 60_000);

/**
 * Read what's new and save it. The first sync reaches back 30 days (as far as
 * Health Connect lets a newly connected app see); later ones go back three
 * days before the last, because trackers often save a night or a workout
 * hours after it ends.
 */
export async function syncHealth(state: AppState, now: number = Date.now()): Promise<{ state: AppState; nights: number; workouts: number } | null> {
  const p = healthPrefs();
  if (!p.on || !healthSupported()) return null;
  const since = p.lastSync ? Math.max(now - 30 * D, p.lastSync - 3 * D) : now - 30 * D;
  const range = { startDate: new Date(since).toISOString(), endDate: new Date(now).toISOString() };
  const { h } = await plugin();
  const [sleep, exercise] = await Promise.all([
    h.readSamples({ dataType: 'sleep', ...range, limit: 400 }).catch(() => ({ samples: [] as HealthSample[] })),
    h.queryWorkouts({ ...range, limit: 400 }).catch(() => ({ workouts: [] as HcWorkout[] })),
  ]);
  const nights = sleep.samples.map(nightFrom).filter((x): x is ImportNight => !!x).sort(bySource);
  const workouts = exercise.workouts
    .map((w) => workoutFrom(w, state.wCats))
    .filter((x): x is ImportWorkout => !!x)
    .sort(bySource);
  const r = await api.healthImport({ nights, workouts });
  setHealthPrefs({ ...healthPrefs(), lastSync: now });
  const { imported, ...rest } = r;
  return { state: rest as AppState, nights: imported?.nights ?? 0, workouts: imported?.workouts ?? 0 };
}
