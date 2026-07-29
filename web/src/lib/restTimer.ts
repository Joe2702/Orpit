import { useEffect, useState } from 'react';
import { isNative, scheduleRestAlarm, cancelRestAlarm } from './notify';

// A rest countdown between sets.
//
// State is a single wall-clock end time, not a decrementing counter: when the
// phone sleeps or the app is backgrounded, timers stop firing but the clock
// doesn't, so recomputing from `endsAt` on every tick keeps the countdown
// honest across a lock/unlock. A native notification is scheduled for the same
// moment, so the alert lands even if Orbit isn't on screen.

const KEY = 'orbit_rest_until';

let endsAt: number | null = null;
let total = 0;
const subs = new Set<() => void>();

// Restore across a reload — a refresh mid-set shouldn't lose the countdown.
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && typeof saved.endsAt === 'number' && saved.endsAt > Date.now()) {
    endsAt = saved.endsAt;
    total = Number(saved.total) || 90;
  }
} catch {
  /* corrupt value → start with no timer */
}

function emit() {
  if (endsAt) localStorage.setItem(KEY, JSON.stringify({ endsAt, total }));
  else localStorage.removeItem(KEY);
  subs.forEach((f) => f());
}

export function startRest(seconds: number): void {
  total = seconds;
  endsAt = Date.now() + seconds * 1000;
  emit();
  if (isNative()) scheduleRestAlarm(new Date(endsAt));
}

export function addRest(seconds: number): void {
  if (!endsAt) return;
  // Extend from the greater of now and the current end, so adding time to an
  // already-expired timer starts a fresh interval rather than a past one.
  endsAt = Math.max(Date.now(), endsAt) + seconds * 1000;
  total = Math.max(total, Math.ceil((endsAt - Date.now()) / 1000));
  emit();
  if (isNative()) scheduleRestAlarm(new Date(endsAt));
}

export function stopRest(): void {
  endsAt = null;
  total = 0;
  emit();
  if (isNative()) cancelRestAlarm();
}

/** Seconds left (0 once finished) and the interval it counted down from. */
export function useRest(): { remaining: number | null; total: number } {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    const id = setInterval(f, 500);
    return () => {
      subs.delete(f);
      clearInterval(id);
    };
  }, []);
  if (endsAt == null) return { remaining: null, total: 0 };
  return { remaining: Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)), total };
}
