import type { AppState } from '../types';

// Offline logging.
//
// The goal is narrow and deliberate: *logging* keeps working with no signal —
// workouts, sleep, transactions, habit check-ins, counter logs. Setup work
// (creating categories, budgets, accounts, changing settings) still needs a
// connection, because those are rare, deliberate actions where failing loudly
// is better than silently deferring.
//
// Two pieces make it work:
//   1. A cached copy of the last known state, so opening the app with no
//      network shows your data instead of a spinner.
//   2. A persisted FIFO queue of mutations, replayed in order on reconnect.
//      Every queued op carries a stable id which the server uses as an
//      idempotency key, so a replay after a lost response can't duplicate an
//      entry or silently un-toggle a habit.

const QUEUE_KEY = 'orbit_offline_queue';
const STATE_KEY = 'orbit_state_cache';

/** Thrown instead of a network error when a mutation was safely queued. */
export class OfflineQueuedError extends Error {
  constructor() {
    super('Saved on this device — it will sync when you’re back online');
    this.name = 'OfflineQueuedError';
  }
}

export interface QueuedOp {
  id: string;
  path: string;
  method: string;
  body?: string;
  at: number;
  /**
   * How many times the *server* has refused this op with an error it might
   * recover from. Network failures don't count: being offline says nothing
   * about whether the op is sound, and counting them would discard a perfectly
   * good entry just for being logged on a plane.
   */
  tries?: number;
  /** Why it last failed, so a stuck queue can say something useful. */
  lastError?: string;
}

/**
 * How many server-side failures an op gets before it is given up on.
 *
 * A queue that retries forever is not resilient, it is stuck: one op the server
 * cannot accept blocks every entry behind it, invisibly, for as long as the app
 * is installed. Six attempts is far more than any transient outage needs, and
 * far less than forever.
 */
export const MAX_TRIES = 6;

/**
 * Endpoints safe to defer. Everything here either creates a new entry or
 * toggles one, and each is covered by the server's idempotency check — so
 * replaying one twice is a no-op rather than a duplicate.
 */
const QUEUEABLE: RegExp[] = [
  /^\/workouts(\/[^/]+)?$/,
  /^\/nights(\/[^/]+)?$/,
  /^\/txns(\/[^/]+)?$/,
  /^\/habits\/[^/]+\/toggle$/,
  /^\/counters\/[^/]+\/log$/,
];

export function isQueueable(path: string, method: string): boolean {
  if (method === 'GET') return false;
  return QUEUEABLE.some((re) => re.test(path));
}

// ---- listeners ----------------------------------------------------------

const subs = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
const emit = () => subs.forEach((f) => f());

// ---- queue --------------------------------------------------------------

function read(): QueuedOp[] {
  try {
    const v = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(q: QueuedOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage full — the in-flight op is lost, but the app keeps working */
  }
  emit();
}

export const pending = (): number => read().length;
export const queuedOps = (): QueuedOp[] => read();

export function newOpId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueue(op: QueuedOp): void {
  const q = read();
  // A hard cap stops a device that's been offline for weeks from growing an
  // unbounded queue; the oldest entries go first.
  if (q.length >= 500) q.shift();
  q.push(op);
  write(q);
}

export function clearQueue(): void {
  write([]);
}

// ---- cached state -------------------------------------------------------

export function cacheState(s: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* over quota — the app still works, it just won't open offline */
  }
}

export function readCachedState(): AppState | null {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    return v && typeof v === 'object' && v.profile ? (v as AppState) : null;
  } catch {
    return null;
  }
}

export function clearCache(): void {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(QUEUE_KEY);
  emit();
}

// ---- connectivity -------------------------------------------------------

// Real connectivity, not navigator.onLine.
//
// Inside the Android WebView `navigator.onLine` is effectively always true —
// the page is served from a local origin, so the browser sees a live
// connection even in airplane mode. Relying on it meant the offline paths
// never triggered on the one platform they exist for. The native Network
// plugin reports the actual radio state; the browser flag is only a fallback,
// and a failed request corrects both.
let liveOnline: boolean | null = null;

export const isOnline = (): boolean => {
  if (liveOnline !== null) return liveOnline;
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
};

/** Record what actually happened on the wire; the truest signal available. */
export function noteReachable(ok: boolean): void {
  if (liveOnline === ok) return;
  liveOnline = ok;
  emit();
}

/** Subscribe to the native connectivity status. No-op off-device. */
export function watchConnectivity(): void {
  import('@capacitor/network')
    .then(async ({ Network }) => {
      const apply = (connected: boolean) => noteReachable(connected);
      const status = await Network.getStatus();
      apply(status.connected);
      Network.addListener('networkStatusChange', (st) => apply(st.connected));
    })
    .catch(() => {
      /* not native — navigator.onLine and request outcomes carry it */
    });
}

/**
 * An entry the server hasn't seen yet. Optimistic creates carry a `tmp_` id
 * until the real state comes back, so the prefix is the marker for "this exists
 * only on this device so far" — which is what gates editing it and what the
 * unsynced dot is drawn from.
 */
export const isUnsynced = (id: string): boolean => id.startsWith('tmp_');

/** What to tell someone who tried to act on an entry that hasn't synced yet. */
export const unsyncedMessage = (): string =>
  isOnline() ? 'Still saving — try again in a moment' : "Waiting to sync — you can change this once you're back online";

/**
 * Replay the queue in order. Stops at the first op that fails for a reason
 * worth retrying (still offline, server asleep) and leaves the rest queued.
 * An op the server actively rejects is dropped — retrying a 400 forever would
 * wedge everything behind it.
 *
 * `send` is injected to avoid a circular import with the api module.
 */
export async function flush(
  send: (op: QueuedOp) => Promise<AppState>
): Promise<{ synced: number; failed: number; state: AppState | null; gaveUp: QueuedOp[] }> {
  let synced = 0;
  let failed = 0;
  let last: AppState | null = null;
  // Ops abandoned this pass, so the caller can say so out loud instead of
  // letting entries disappear without a word.
  const giveUp: QueuedOp[] = [];

  const drop = (id: string) => write(read().filter((x) => x.id !== id));
  const bump = (id: string, why: string) =>
    write(read().map((x) => (x.id === id ? { ...x, tries: (x.tries || 0) + 1, lastError: why } : x)));

  // Work against a snapshot; ops added while flushing stay for the next pass.
  for (const op of read()) {
    try {
      last = await send(op);
      synced++;
      drop(op.id);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const msg = (e as Error)?.message || 'Unknown error';

      if (typeof status !== 'number') {
        // No response at all: the connection failed. Nothing is wrong with the
        // op, so it keeps its attempts and everything waits for a signal.
        break;
      }
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        // Permanently rejected (deleted parent, validation): drop it rather
        // than block every later entry behind something that can never apply.
        failed++;
        drop(op.id);
        continue;
      }
      // The server answered, badly. That may be a passing outage — or an op it
      // will never accept, which used to wedge the whole queue for good.
      const tries = (op.tries || 0) + 1;
      if (tries >= MAX_TRIES) {
        failed++;
        giveUp.push({ ...op, tries, lastError: msg });
        drop(op.id);
        continue; // let everything behind it through
      }
      bump(op.id, msg);
      break; // transient — keep this op and everything after it
    }
  }
  return { synced, failed, state: last, gaveUp: giveUp };
}
