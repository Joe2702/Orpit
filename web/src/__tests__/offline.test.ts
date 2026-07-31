import { describe, it, expect, beforeEach } from 'vitest';
import {
  noteReachable,
  isOnline,
  enqueue,
  flush,
  pending,
  queuedOps,
  clearQueue,
  clearCache,
  subscribe,
  isQueueable,
  newOpId,
  isUnsynced,
  unsyncedMessage,
  cacheState,
  readCachedState,
} from '../lib/offline';
import type { AppState } from '../types';

// A minimal localStorage so the module under test runs unmodified in node.
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
};
const setOnline = (v: boolean) =>
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: v }, configurable: true });
setOnline(true);

const op = (id: string) => ({ id, path: '/workouts', method: 'POST', at: Date.now() });
const okState = () => ({ profile: {} }) as unknown as AppState;

beforeEach(() => {
  clearQueue();
  clearCache();
  setOnline(true);
});

describe('what may be deferred offline', () => {
  it('queues the things people log', () => {
    expect(isQueueable('/workouts', 'POST')).toBe(true);
    expect(isQueueable('/workouts/12', 'PATCH')).toBe(true);
    expect(isQueueable('/nights', 'POST')).toBe(true);
    expect(isQueueable('/txns/9', 'DELETE')).toBe(true);
    expect(isQueueable('/habits/4/toggle', 'POST')).toBe(true);
    expect(isQueueable('/counters/3/log', 'POST')).toBe(true);
  });

  it('never queues reads, auth, or setup work', () => {
    // Setup failing loudly is deliberate: those are rare, deliberate actions
    // where silently deferring is worse than an error.
    expect(isQueueable('/workouts', 'GET')).toBe(false);
    expect(isQueueable('/auth/login', 'POST')).toBe(false);
    expect(isQueueable('/budgets', 'POST')).toBe(false);
    expect(isQueueable('/accounts', 'POST')).toBe(false);
    expect(isQueueable('/habits', 'POST')).toBe(false);
    expect(isQueueable('/me', 'PATCH')).toBe(false);
    expect(isQueueable('/habits/order', 'PATCH')).toBe(false);
  });
});

describe('the queue', () => {
  it('keeps insertion order and survives a reload', () => {
    ['a', 'b', 'c'].forEach((id) => enqueue(op(id)));
    expect(queuedOps().map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(store['orbit_offline_queue']).toBeTruthy();
  });

  it('replays in order, under the original ids', async () => {
    ['a', 'b', 'c'].forEach((id) => enqueue(op(id)));
    const seen: string[] = [];
    const r = await flush(async (o) => {
      seen.push(o.id);
      return okState();
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r.synced).toBe(3);
    expect(pending()).toBe(0);
  });

  it('stops at a transient failure and keeps everything behind it', async () => {
    ['d', 'e', 'f'].forEach((id) => enqueue(op(id)));
    const r = await flush(async (o) => {
      if (o.id === 'e') throw new Error('still offline');
      return okState();
    });
    expect(r.synced).toBe(1);
    // Order matters: 'f' must not jump ahead of the entry that failed.
    expect(queuedOps().map((o) => o.id)).toEqual(['e', 'f']);
  });

  it('drops a permanently rejected op rather than wedging the queue', async () => {
    ['g', 'h'].forEach((id) => enqueue(op(id)));
    const r = await flush(async (o) => {
      if (o.id === 'g') throw Object.assign(new Error('bad request'), { status: 400 });
      return okState();
    });
    expect(r.failed).toBe(1);
    expect(r.synced).toBe(1);
    expect(pending()).toBe(0);
  });

  it('treats 5xx, 408 and 429 as retryable, not permanent', async () => {
    for (const status of [500, 502, 408, 429]) {
      clearQueue();
      enqueue(op('x'));
      await flush(async () => {
        throw Object.assign(new Error('later'), { status });
      });
      expect(pending(), `status ${status} should stay queued`).toBe(1);
    }
  });

  it('mints unique op ids', () => {
    const ids = new Set(Array.from({ length: 20000 }, newOpId));
    expect(ids.size).toBe(20000);
  });
});

describe('unsynced entries', () => {
  it('recognises an optimistic id', () => {
    expect(isUnsynced('tmp_1730000000')).toBe(true);
    expect(isUnsynced('4821')).toBe(false);
  });

  it('explains the wait differently online and offline', () => {
    setOnline(true);
    expect(unsyncedMessage()).toContain('Still saving');
    setOnline(false);
    // Offline this can last hours, so it must not imply a moment.
    expect(unsyncedMessage()).toContain('back online');
    expect(unsyncedMessage()).not.toContain('moment');
  });
});

describe('connectivity', () => {
  it('believes a failed request over navigator.onLine', () => {
    // The Android WebView reports onLine: true even in airplane mode, because
    // the page is served from a local origin. That lie is why the offline
    // paths never triggered on the one platform they exist for.
    setOnline(true);
    noteReachable(false);
    expect(isOnline()).toBe(false);
  });

  it('recovers as soon as a request succeeds', () => {
    noteReachable(false);
    expect(isOnline()).toBe(false);
    noteReachable(true);
    expect(isOnline()).toBe(true);
  });

  it('notifies subscribers when connectivity flips', () => {
    noteReachable(true);
    let calls = 0;
    const off = subscribe(() => calls++);
    noteReachable(false);
    expect(calls).toBe(1);
    noteReachable(false); // no change, no notification
    expect(calls).toBe(1);
    off();
  });
});

describe('the state cache', () => {
  it('round-trips and is cleared on sign-out', () => {
    cacheState({ profile: { name: 'Y' }, workouts: [1, 2, 3] } as unknown as AppState);
    expect(readCachedState()?.workouts).toHaveLength(3);
    clearCache();
    expect(readCachedState()).toBeNull();
  });

  it('ignores a corrupt cache instead of throwing', () => {
    store['orbit_state_cache'] = '{not json';
    expect(readCachedState()).toBeNull();
  });
});
