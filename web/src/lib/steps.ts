// Turning a phone's step sensor into "steps today".
//
// Android's hardware counter reports steps *since the device last booted*, not
// since midnight, and it resets to zero on reboot. Neither of those is what
// anyone wants to see, so the daily total has to be reconstructed — and the
// reconstruction is the whole risk here. Get it wrong in one direction and a
// day's walking vanishes on a restart; get it wrong in the other and the count
// jumps by tens of thousands the first time the app opens after a reboot.
//
// The rule: remember where the day started, and bank the total whenever the
// counter goes backwards, because only a reboot can do that.

export interface StepTracker {
  /** Local day the figures below belong to. */
  day: string;
  /** Sensor reading when this day started, or when the device last booted. */
  base: number;
  /** Steps already banked today, from before a reboot. */
  carried: number;
  /** The most recent reading, so a reset can be spotted. */
  last: number;
}

export interface StepResult {
  tracker: StepTracker;
  steps: number;
}

export const emptyTracker = (day: string): StepTracker => ({ day, base: 0, carried: 0, last: 0 });

/**
 * Fold a new sensor reading into the running total.
 *
 * `sinceBoot` is the raw cumulative counter. `today` is the local day key, which
 * the caller supplies so this stays pure and testable across midnight.
 */
export function reconcile(prev: StepTracker | null, sinceBoot: number, today: string): StepResult {
  // A sensor that reports nonsense is worse than one that reports nothing.
  if (!isFinite(sinceBoot) || sinceBoot < 0) {
    const t = prev ?? emptyTracker(today);
    return { tracker: t, steps: stepsOf(t, t.last) };
  }

  if (!prev || prev.day !== today) {
    // A new day starts from wherever the counter happens to be. Yesterday's
    // steps are not subtracted from today's — they were a different day.
    return { tracker: { day: today, base: sinceBoot, carried: 0, last: sinceBoot }, steps: 0 };
  }

  if (sinceBoot < prev.last) {
    // The counter only goes backwards when the device has rebooted. Bank what
    // was walked before the restart, then start again from zero.
    const banked = prev.carried + (prev.last - prev.base);
    return {
      tracker: { day: today, base: 0, carried: banked, last: sinceBoot },
      steps: banked + sinceBoot,
    };
  }

  const tracker = { ...prev, last: sinceBoot };
  return { tracker, steps: stepsOf(tracker, sinceBoot) };
}

const stepsOf = (t: StepTracker, reading: number): number =>
  Math.max(0, t.carried + (reading - t.base));

/** "8,432" — the only formatting a step count needs. */
export const formatSteps = (n: number): string => Math.round(n).toLocaleString();

/**
 * A rough distance, for a second line under the number.
 *
 * Deliberately approximate and labelled as such: stride length varies by a
 * third between people, and presenting a derived guess to three significant
 * figures would imply a precision the sensor does not have.
 */
export const approxKm = (steps: number): number => Math.round((steps * 0.762) / 100) / 10;
