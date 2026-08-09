import { Capacitor, registerPlugin } from '@capacitor/core';
import { dayKey } from './format';
import { reconcile, type StepTracker } from './steps';

// The bridge between the phone's step sensor and the app.
//
// The native side hands over one number — steps since the device booted — and
// everything that turns that into a daily total lives in `steps.ts`, where it
// is testable. This file only moves values around: read the sensor, fold it in,
// remember where we got to, tell the server.

interface OrbitStepsPlugin {
  check(): Promise<{ available: boolean; granted: boolean }>;
  request(): Promise<{ available: boolean; granted: boolean }>;
  read(): Promise<{ sinceBoot: number }>;
}

const OrbitSteps = registerPlugin<OrbitStepsPlugin>('OrbitSteps');

const KEY = 'orbit_step_tracker';

function loadTracker(): StepTracker | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.day === 'string' ? (v as StepTracker) : null;
  } catch {
    return null;
  }
}

function saveTracker(t: StepTracker): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage full: the count restarts from this reading, nothing breaks */
  }
}

export const stepsSupported = (): boolean => Capacitor.isNativePlatform();

/** Whether the sensor exists and we're allowed to read it. */
export async function stepsStatus(): Promise<{ available: boolean; granted: boolean }> {
  if (!stepsSupported()) return { available: false, granted: false };
  try {
    return await OrbitSteps.check();
  } catch {
    return { available: false, granted: false };
  }
}

/** Ask for the activity permission. Returns the status afterwards. */
export async function enableSteps(): Promise<{ available: boolean; granted: boolean }> {
  if (!stepsSupported()) return { available: false, granted: false };
  try {
    return await OrbitSteps.request();
  } catch {
    return { available: false, granted: false };
  }
}

/**
 * Read the sensor and return today's total, or null if there's nothing to read.
 *
 * Never throws: this runs on app resume, and a missing sensor or a refused
 * permission is a normal state of the world, not an error worth surfacing.
 */
export async function readStepsToday(now: number = Date.now()): Promise<number | null> {
  if (!stepsSupported()) return null;
  try {
    const status = await OrbitSteps.check();
    if (!status.available || !status.granted) return null;
    const { sinceBoot } = await OrbitSteps.read();
    const { tracker, steps } = reconcile(loadTracker(), sinceBoot, dayKey(now));
    saveTracker(tracker);
    return steps;
  } catch {
    return null;
  }
}

/**
 * Read and push, if there is anything new to say.
 *
 * `known` is what the server already has for today, so a phone sitting idle
 * doesn't re-send the same number on every resume. Steps only ever climb within
 * a day, so anything not larger is not news.
 */
export async function syncSteps(
  known: number,
  push: (day: string, steps: number) => Promise<unknown>,
  now: number = Date.now()
): Promise<number | null> {
  const steps = await readStepsToday(now);
  if (steps == null) return null;
  if (steps <= known) return steps;
  try {
    await push(dayKey(now), steps);
  } catch {
    /* the next resume tries again; nothing is lost but a little freshness */
  }
  return steps;
}
