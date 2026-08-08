import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_TRIES,
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


// A queue that retries forever is not resilient, it is stuck.
//
// Reported from a real phone: three entries sat "waiting · tap to retry" for two
// days on a working connection. Any 5xx was treated as a passing outage and
// retried indefinitely, so a single op the server could never accept blocked
// every entry behind it — invisibly, with no way out short of reinstalling.

describe('an op the server keeps refusing', () => {
  const failWith = (status: number) => async () => {
    throw Object.assign(new Error('boom'), { status });
  };

  it('is given up on rather than blocking the queue forever', async () => {
    clearQueue();
    ['bad', 'good'].forEach((id) => enqueue(op(id)));
    let r;
    for (let i = 0; i < MAX_TRIES; i++) {
      r = await flush(async (o) => {
        if (o.id === 'bad') throw Object.assign(new Error('server error'), { status: 500 });
        return okState();
      });
    }
    expect(r!.failed).toBe(1);
    expect(r!.gaveUp.map((x) => x.id)).toEqual(['bad']);
    // …and crucially the entry stuck behind it finally goes through.
    expect(r!.synced).toBe(1);
    expect(pending()).toBe(0);
  });

  it('keeps trying for a while first — a real outage must not lose data', async () => {
    clearQueue();
    enqueue(op('x'));
    for (let i = 0; i < MAX_TRIES - 1; i++) await flush(failWith(503));
    expect(pending(), 'still queued before the limit').toBe(1);
    expect(queuedOps()[0].tries).toBe(MAX_TRIES - 1);
  });

  it('records why it failed', async () => {
    clearQueue();
    enqueue(op('x'));
    await flush(async () => {
      throw Object.assign(new Error('Server error'), { status: 500 });
    });
    expect(queuedOps()[0].lastError).toContain('Server error');
  });

  it('never counts a network failure against an op', async () => {
    // Being offline says nothing about whether the entry is sound. Counting
    // these would discard a perfectly good workout for being logged on a plane.
    clearQueue();
    enqueue(op('x'));
    for (let i = 0; i < MAX_TRIES * 3; i++) {
      await flush(async () => {
        throw new Error('Failed to fetch'); // no status: never reached a server
      });
    }
    expect(pending()).toBe(1);
    expect(queuedOps()[0].tries ?? 0).toBe(0);
  });

  it('still drops a 4xx immediately, without waiting out the limit', async () => {
    clearQueue();
    enqueue(op('x'));
    const r = await flush(failWith(400));
    expect(r.failed).toBe(1);
    expect(pending()).toBe(0);
  });
});
