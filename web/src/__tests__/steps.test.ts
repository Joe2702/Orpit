import { describe, it, expect } from 'vitest';
import { reconcile, emptyTracker, formatSteps, approxKm } from '../lib/steps';

// The step counter reports steps since the device booted, and resets to zero on
// reboot. Rebuilding "steps today" from that is where this can go wrong in two
// directions: losing a day's walking on a restart, or jumping by tens of
// thousands the first time the app opens after one.

describe('steps today', () => {
  it('starts a fresh day wherever the counter happens to be', () => {
    // The phone has been up for a week; the counter is huge and means nothing.
    const r = reconcile(null, 412_339, '2026-08-05');
    expect(r.steps).toBe(0);
    expect(r.tracker.base).toBe(412_339);
  });

  it('counts forward from the start of the day', () => {
    let t = reconcile(null, 100_000, '2026-08-05').tracker;
    expect(reconcile(t, 103_500, '2026-08-05').steps).toBe(3_500);
  });

  it('resets at midnight instead of carrying yesterday over', () => {
    const t = reconcile(null, 100_000, '2026-08-05').tracker;
    const walked = reconcile(t, 108_000, '2026-08-05');
    expect(walked.steps).toBe(8_000);
    const tomorrow = reconcile(walked.tracker, 108_000, '2026-08-06');
    expect(tomorrow.steps).toBe(0);
  });

  it('keeps the steps taken before a reboot', () => {
    // 6,000 steps, then the phone restarts and the counter drops to 0.
    let r = reconcile(null, 50_000, '2026-08-05');
    r = reconcile(r.tracker, 56_000, '2026-08-05');
    expect(r.steps).toBe(6_000);

    r = reconcile(r.tracker, 0, '2026-08-05'); // rebooted
    expect(r.steps).toBe(6_000);

    r = reconcile(r.tracker, 900, '2026-08-05'); // walking again
    expect(r.steps).toBe(6_900);
  });

  it('survives two reboots in a day', () => {
    let r = reconcile(null, 10_000, '2026-08-05');
    r = reconcile(r.tracker, 11_000, '2026-08-05'); // +1000
    r = reconcile(r.tracker, 0, '2026-08-05');
    r = reconcile(r.tracker, 500, '2026-08-05'); // +500
    r = reconcile(r.tracker, 0, '2026-08-05');
    r = reconcile(r.tracker, 200, '2026-08-05'); // +200
    expect(r.steps).toBe(1_700);
  });

  it('never reports a negative total', () => {
    const t = { day: '2026-08-05', base: 900, carried: 0, last: 900 };
    expect(reconcile(t, 900, '2026-08-05').steps).toBe(0);
  });

  it('ignores a nonsense reading rather than acting on it', () => {
    // A sensor that reports rubbish is worse than one that reports nothing:
    // NaN would poison every later subtraction.
    const t = { day: '2026-08-05', base: 100, carried: 0, last: 600 };
    expect(reconcile(t, NaN, '2026-08-05').steps).toBe(500);
    expect(reconcile(t, -5, '2026-08-05').steps).toBe(500);
    expect(reconcile(t, NaN, '2026-08-05').tracker).toEqual(t);
  });

  it('is stable when the same reading arrives twice', () => {
    // The app reads on resume, and resume can fire twice in a row.
    let r = reconcile(null, 1_000, '2026-08-05');
    r = reconcile(r.tracker, 1_400, '2026-08-05');
    const once = r.steps;
    r = reconcile(r.tracker, 1_400, '2026-08-05');
    expect(r.steps).toBe(once);
  });

  it('starts a day from nothing when there is no history at all', () => {
    expect(emptyTracker('2026-08-05')).toEqual({ day: '2026-08-05', base: 0, carried: 0, last: 0 });
  });
});

describe('presentation', () => {
  it('groups thousands', () => {
    expect(formatSteps(8432)).toBe('8,432');
  });

  it('keeps the distance visibly approximate', () => {
    // One decimal place, because stride length varies by a third between people
    // and more digits would claim precision the sensor cannot support.
    expect(approxKm(10_000)).toBe(7.6);
    expect(approxKm(0)).toBe(0);
  });
});
