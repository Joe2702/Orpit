import { describe, it, expect, vi } from 'vitest';

// A minimal localStorage, so the phone's kept bank messages can be seeded.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('../lib/notify', () => ({ ensureNotificationPermission: async () => true }));

const { declinedImports, removeDeclined } = await import('../lib/smsSync');
import type { AppState, Txn } from '../types';

const TS = Date.UTC(2026, 10, 2, 10);
const tx = (id: string, smsKey: string | null, sms = true) => ({ id, name: 'x', cat: 'Shopping', amount: -500, income: false, ts: TS, sms, smsKey }) as unknown as Txn;
const state = (txns: Txn[]) => ({ profile: { currency: 'EGP' }, txns }) as unknown as AppState;

store.set(
  'orbit_sms_texts',
  JSON.stringify({
    k1: { sender: 'CIB', body: 'Your purchase of EGP 500.00 at TALABAT was not approved.', ts: TS },
    k2: { sender: 'CIB', body: 'Your CIB card ending 1234 was charged EGP 500.00 at TALABAT.', ts: TS },
    k3: { sender: 'NBE', body: 'لم يتم تنفيذ عملية شراء بمبلغ 300 جنيه لدى نون', ts: TS },
  })
);

describe('cleaning up declines that were imported before', () => {
  const s = state([tx('a', 'k1'), tx('b', 'k2'), tx('c', 'k3'), tx('d', 'k1:fee'), tx('e', 'gone'), tx('f', null, false)]);

  it('finds entries whose own message says declined, fees included', () => {
    expect(declinedImports(s).sort()).toEqual(['a', 'c', 'd']);
  });

  it('leaves real payments, hand-typed entries and ones whose message is gone', () => {
    const ids = declinedImports(s);
    for (const id of ['b', 'e', 'f']) expect(ids).not.toContain(id);
  });

  it('deletes each one and hands back the state after', async () => {
    const deleted: string[] = [];
    const r = await removeDeclined(s, async (id) => {
      deleted.push(id);
      return state(s.txns.filter((t) => !deleted.includes(t.id)));
    });
    expect(r.removed).toBe(3);
    expect(r.state.txns.map((t) => t.id)).toEqual(['b', 'e', 'f']);
  });
});
