import { describe, it, expect, vi, beforeEach } from 'vitest';

// A phone with Health Connect, stood in for: Android, one Fitbit night and one
// run waiting, and a server that answers like the real one.
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
const calls: { method: string; opts: Record<string, string | number> }[] = [];
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capgo/capacitor-health', () => ({
  Health: {
    readSamples: async (opts: Record<string, string | number>) => {
      calls.push({ method: 'readSamples', opts });
      return { samples: [{ dataType: 'sleep', value: 450, unit: 'minute', startDate: '2026-10-30T23:00:00.000Z', endDate: '2026-10-31T06:30:00.000Z', sourceName: 'com.fitbit.FitbitMobile', platformId: 'n1' }] };
    },
    queryWorkouts: async (opts: Record<string, string | number>) => {
      calls.push({ method: 'queryWorkouts', opts });
      return { workouts: [{ workoutType: 'running', duration: 1800, startDate: '2026-10-31T16:00:00.000Z', endDate: '2026-10-31T16:30:00.000Z', sourceName: 'com.fitbit.FitbitMobile', platformId: 'w1' }] };
    },
  },
}));
const sent: { nights: unknown[]; workouts: unknown[] }[] = [];
vi.mock('../api', () => ({
  api: {
    healthImport: async (b: { nights: unknown[]; workouts: unknown[] }) => {
      sent.push(b);
      return { nights: [], workouts: [], imported: { nights: b.nights.length, workouts: b.workouts.length, skipped: 0 } };
    },
  },
}));

import { syncHealth, setHealthPrefs, healthPrefs, syncDue } from '../lib/health';
import type { AppState } from '../types';

const NOW = Date.parse('2026-11-01T09:00:00.000Z');
const D = 86_400_000;
const state = { wCats: [{ id: 'c1', name: 'Run' }] } as unknown as AppState;

describe('syncing from Health Connect', () => {
  beforeEach(() => {
    mem.clear();
    calls.length = 0;
    sent.length = 0;
  });

  it('does nothing until it’s been turned on', async () => {
    expect(await syncHealth(state, NOW)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('reads the last 30 days the first time, sends what it found, and remembers when', async () => {
    setHealthPrefs({ on: true, lastSync: null });
    const r = await syncHealth(state, NOW);
    expect(r).toMatchObject({ nights: 1, workouts: 1 });
    expect(calls.map((c) => c.method).sort()).toEqual(['queryWorkouts', 'readSamples']);
    expect(Date.parse(String(calls[0].opts.startDate))).toBe(NOW - 30 * D);
    expect(sent[0].nights).toMatchObject([{ extId: 'hc:n1', source: 'Fitbit', hours: 7.5 }]);
    expect(sent[0].workouts).toMatchObject([{ extId: 'hc:w1', name: 'Run', catId: 'c1', dur: 30 }]);
    expect(healthPrefs().lastSync).toBe(NOW);
    // The server's count isn't part of the state handed back.
    expect('imported' in (r!.state as object)).toBe(false);
  });

  it('then reaches back three days before the last sync, and waits 15 minutes between automatic ones', async () => {
    setHealthPrefs({ on: true, lastSync: NOW - 2 * D });
    await syncHealth(state, NOW);
    expect(Date.parse(String(calls[0].opts.startDate))).toBe(NOW - 5 * D);
    expect(syncDue(NOW + 10 * 60_000)).toBe(false);
    expect(syncDue(NOW + 16 * 60_000)).toBe(true);
  });
});
