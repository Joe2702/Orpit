import { describe, it, expect } from 'vitest';
import { findRecurring, monthlyCost } from '../lib/subscriptions';
import type { AppState, Txn } from '../types';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 12).getTime();
let n = 0;
const t = (name: string, amount: number, daysAgo: number, extra: Partial<Txn> = {}): Txn =>
  ({ id: String(++n), name, cat: 'Subscriptions', amount, income: amount > 0, accId: 'a1', toAccId: null, adjust: false, note: null, photo: false, ts: NOW - daysAgo * DAY, ...extra }) as Txn;
const state = (txns: Txn[], recurring: AppState['recurring'] = []) => ({ txns, recurring }) as unknown as AppState;

describe('finding subscriptions and bills', () => {
  it('finds a monthly charge from three payments a month apart', () => {
    const [f] = findRecurring(state([t('Netflix', -240, 65), t('Netflix', -240, 35), t('Netflix', -240, 5)]), NOW);
    expect(f).toMatchObject({ name: 'Netflix', freq: 'Monthly', amount: 240, seen: 3 });
    expect(f.nextTs).toBeGreaterThan(NOW);
    expect(f.nextTs - NOW).toBeLessThan(30 * DAY);
  });

  it('allows a bill that moves a little, not a shop with any amount', () => {
    const phone = [t('Vodafone', -410, 62), t('Vodafone', -430, 31), t('Vodafone', -420, 1)];
    const shop = [t('Carrefour', -900, 61, { cat: 'Groceries' }), t('Carrefour', -2100, 31, { cat: 'Groceries' }), t('Carrefour', -350, 2, { cat: 'Groceries' })];
    const names = findRecurring(state([...phone, ...shop]), NOW).map((f) => f.name);
    expect(names).toEqual(['Vodafone']);
  });

  it('finds a salary as expected income', () => {
    const pay = [t('Salary', 32000, 58, { cat: 'Salary' }), t('ACME CORP', 32000, 59), t('ACME CORP', 32000, 29), t('ACME CORP', 32000, 0.5)];
    const f = findRecurring(state(pay), NOW).find((x) => x.name === 'ACME CORP');
    expect(f).toMatchObject({ income: true, freq: 'Monthly' });
  });

  it('skips what is already set up, and stopped ones', () => {
    const net = [t('Netflix', -240, 65), t('Netflix', -240, 35), t('Netflix', -240, 5)];
    const already = [{ id: 'r', name: 'NETFLIX', cat: 'x', accId: null, amount: 240, freq: 'Monthly', income: false, nextTs: null }] as AppState['recurring'];
    expect(findRecurring(state(net, already), NOW)).toEqual([]);
    const stopped = [t('Gym', -1100, 160), t('Gym', -1100, 130), t('Gym', -1100, 100)];
    expect(findRecurring(state(stopped), NOW)).toEqual([]);
  });

  it('adds up a month of recurring costs', () => {
    expect(monthlyCost([{ amount: 240, freq: 'Monthly' }, { amount: 100, freq: 'Weekly' }, { amount: 1200, freq: 'Yearly' }, { amount: 9, freq: 'Monthly', income: true }])).toBeCloseTo(240 + 433 + 100);
  });
});
