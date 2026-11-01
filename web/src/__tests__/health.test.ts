import { describe, it, expect } from 'vitest';
import { nightFrom, workoutFrom, estimateQuality, sourceLabel, bySource, IMPORT_NAMES } from '../lib/health';
import { AR_DATA } from '../i18n/ar';
import type { HealthSample, Workout } from '@capgo/capacitor-health';

const at = (h: number, m = 0, day = 31) => new Date(2026, 9, day, h, m).toISOString();
const stage = (stage: string, startDate: string, endDate: string, durationMinutes: number) => ({ stage, startDate, endDate, durationMinutes }) as never;

describe('sleep from Health Connect', () => {
  const sample = (over: Partial<HealthSample> = {}): HealthSample => ({
    dataType: 'sleep',
    value: 480,
    unit: 'minute',
    startDate: at(23, 30, 30),
    endDate: at(7, 30),
    sourceName: 'com.fitbit.FitbitMobile',
    platformId: 'abc-123',
    ...over,
  });

  it('becomes a night: time asleep, bed and wake times, and the tracker’s name', () => {
    const n = nightFrom(
      sample({
        stages: [
          stage('light', at(23, 30, 30), at(2, 0), 150),
          stage('deep', at(2, 0), at(3, 30), 90),
          stage('awake', at(3, 30), at(4, 0), 30),
          stage('rem', at(4, 0), at(5, 30), 90),
          stage('light', at(5, 30), at(7, 30), 120),
        ],
      })
    )!;
    expect(n).toMatchObject({ extId: 'hc:abc-123', source: 'Fitbit', hours: 7.5, bedH: 23.5, wakeH: 7.5 });
    expect(n.ts).toBe(Date.parse(at(7, 30)));
    expect(n.quality).toBeGreaterThanOrEqual(8);
  });

  it('uses the whole session when there are no stages, and leaves naps out', () => {
    expect(nightFrom(sample())!.hours).toBe(8);
    expect(nightFrom(sample({ startDate: at(14), endDate: at(15, 30) }))).toBeNull();
    expect(nightFrom(sample({ platformId: undefined }))).toBeNull();
  });

  it('rates a short, broken night lower than a long, settled one', () => {
    const settled = estimateQuality(480, [stage('light', '', '', 240), stage('deep', '', '', 100), stage('rem', '', '', 120), stage('awake', '', '', 20)]);
    const broken = estimateQuality(300, [stage('light', '', '', 250), stage('deep', '', '', 20), stage('rem', '', '', 30), stage('awake', '', '', 110)]);
    expect(settled).toBeGreaterThan(broken);
    for (const q of [settled, broken, estimateQuality(120), estimateQuality(900)]) {
      expect(q).toBeGreaterThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(10);
    }
  });
});

describe('workouts from Health Connect', () => {
  const w = (over: Partial<Workout> = {}): Workout => ({
    workoutType: 'running',
    duration: 2520,
    totalDistance: 6100,
    totalEnergyBurned: 410.4,
    startDate: at(18),
    endDate: at(18, 42),
    sourceName: 'com.fitbit.FitbitMobile',
    platformId: 'run-1',
    ...over,
  });
  const cats = [
    { id: 'c1', name: 'Push' },
    { id: 'c2', name: 'Run' },
    { id: 'c3', name: 'Football with friends' },
  ];

  it('becomes a workout, in the person’s own category when one fits', () => {
    expect(workoutFrom(w(), cats)).toEqual({ extId: 'hc:run-1', source: 'Fitbit', name: 'Run', catId: 'c2', dur: 42, dist: '6.1 km', kcal: 410, ts: Date.parse(at(18)) });
    expect(workoutFrom(w({ workoutType: 'soccer', platformId: 'f' }), cats)!.catId).toBe('c3');
    const lift = workoutFrom(w({ workoutType: 'traditionalStrengthTraining', totalDistance: 0, totalEnergyBurned: undefined, platformId: 'l' }), cats)!;
    expect([lift.name, lift.catId, lift.dist, lift.kcal]).toEqual(['Strength training', null, null, null]);
    expect(workoutFrom(w({ workoutType: 'fishing', platformId: 'x' }), cats)!.name).toBe('Workout');
  });

  it('leaves out sessions too short to count', () => {
    expect(workoutFrom(w({ duration: 200 }), cats)).toBeNull();
  });
});

describe('where it came from', () => {
  it('names the app, and puts Fitbit first when two apps saved the same thing', () => {
    expect(sourceLabel('com.fitbit.FitbitMobile')).toBe('Fitbit');
    expect(sourceLabel('com.sec.android.app.shealth')).toBe('Samsung Health');
    expect(sourceLabel('com.example.unknown')).toBe('Health Connect');
    const items = [
      { source: 'Google Fit', ts: 1 },
      { source: 'Fitbit', ts: 2 },
    ];
    expect(items.sort(bySource)[0].source).toBe('Fitbit');
  });

  it('has an Arabic name for every kind of imported workout', () => {
    expect(IMPORT_NAMES.filter((n) => !(n in AR_DATA))).toEqual([]);
  });
});
