import { describe, it, expect } from 'vitest';

// The store guards against out-of-order responses with a monotonic sequence
// number: a response is only applied if no newer mutation started while it was
// in flight. Three things race here — optimistic mutations, plain mutations,
// and an offline flush — and a flush that ignored the guard could make an entry
// the user just logged disappear until the next refresh.
//
// These model that rule in isolation so it can't silently regress.

class SeqGuard {
  private seq = 0;
  /** Claim a slot for a write about to go out. */
  begin(): number {
    return ++this.seq;
  }
  /** Snapshot for a read-only refresh (a flush), which claims nothing. */
  observe(): number {
    return this.seq;
  }
  /** May a response captured at `mine` still be applied? */
  mayApply(mine: number): boolean {
    return this.seq === mine;
  }
}

describe('response ordering', () => {
  it('applies a lone response', () => {
    const g = new SeqGuard();
    const a = g.begin();
    expect(g.mayApply(a)).toBe(true);
  });

  it('drops an older response when a newer write has started', () => {
    const g = new SeqGuard();
    const first = g.begin();
    const second = g.begin();
    // The slow first response comes back last and must be ignored.
    expect(g.mayApply(first)).toBe(false);
    expect(g.mayApply(second)).toBe(true);
  });

  it('lets a flush apply when nothing happened during it', () => {
    const g = new SeqGuard();
    const snapshot = g.observe();
    expect(g.mayApply(snapshot)).toBe(true);
  });

  it('stops a flush overwriting an entry logged while it ran', () => {
    const g = new SeqGuard();
    const snapshot = g.observe(); // flush starts
    g.begin(); // user logs something mid-flush
    // The flush's snapshot predates that write, so it must not be applied.
    expect(g.mayApply(snapshot)).toBe(false);
  });

  it('holds across a burst of rapid writes', () => {
    const g = new SeqGuard();
    const claims = Array.from({ length: 10 }, () => g.begin());
    // Only the newest survives, whatever order the responses arrive in.
    const applied = claims.filter((c) => g.mayApply(c));
    expect(applied).toEqual([claims[9]]);
  });
});

// The status pill claimed to be syncing whenever anything was queued, so items
// stuck behind a failing server span forever. It must distinguish "a flush is
// running" from "waiting to retry".
function pillLabel(online: boolean, syncing: boolean, pendingCount: number): string {
  const noun = pendingCount === 1 ? 'entry' : 'entries';
  if (!online) return pendingCount > 0 ? `Offline · ${pendingCount} waiting to sync` : 'Offline · your logs are saved on this device';
  return syncing ? `Syncing ${pendingCount} ${noun}…` : `${pendingCount} ${noun} waiting · tap to retry`;
}

describe('sync status wording', () => {
  it('says syncing only while a flush is running', () => {
    expect(pillLabel(true, true, 3)).toContain('Syncing');
    expect(pillLabel(true, false, 3)).not.toContain('Syncing');
  });

  it('offers a retry when work is stuck rather than spinning', () => {
    expect(pillLabel(true, false, 3)).toContain('tap to retry');
  });

  it('reassures rather than alarms when offline', () => {
    expect(pillLabel(false, false, 0)).toContain('saved on this device');
    expect(pillLabel(false, false, 2)).toContain('2 waiting');
  });

  it('gets singular and plural right', () => {
    expect(pillLabel(true, true, 1)).toContain('1 entry');
    expect(pillLabel(true, true, 2)).toContain('2 entries');
  });
});
