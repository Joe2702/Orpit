import { describe, it, expect } from 'vitest';
import { buildPanels, encodePanel, hm, clock, SEP, PANEL_KEYS } from '../lib/widgetStats';
import { setCurrency } from '../lib/format';
import type { AppState } from '../types';

// The widget panels.
//
// The Java renderer splits a fixed number of fields out of one string and drops
// them into a layout. It cannot validate anything, so the contract has to hold
// on this side: always the same arity, never a separator inside a value, and
// never a raw number where a formatted one was meant.

const D = 86400000;
const now = new Date('2026-08-05T20:00:00Z').getTime(); // a Wednesday

const habit = (id: string, days = '1111111') => ({
  id, name: 'H' + id, color: 'teal', target: '', locked: false, days,
  paused: false, archived: false, why: null, reminderTime: null,
});

const txn = (amount: number) => ({
  id: 't', name: 'x', cat: 'Food', amount, income: amount > 0, accId: null,
  toAccId: null, adjust: false, note: null, photo: false, ts: now,
});

const state = (over: Record<string, unknown> = {}): AppState =>
  ({
    profile: { createdAt: now - 100 * D, currency: 'EGP' },
    habits: [], checkins: [], wCats: [], workouts: [], nights: [], txns: [],
    accounts: [], fcats: [], budgets: [], goals: [], recurring: [],
    counters: [], countLogs: [], wTemplates: [],
    archive: { workouts: 0, nights: 0, txns: 0, countLogs: 0, checkins: 0, txnSum: 0, activeDays: 0, earliestTs: null, accSums: {} },
    ...over,
  }) as unknown as AppState;

describe('formatting', () => {
  it('reads hours the way a person says them', () => {
    expect(hm(7.7)).toBe('7h 42m');
    expect(hm(8)).toBe('8h');
    expect(hm(0)).toBe('—');
    // 59.6 minutes must not render as "7h 60m".
    expect(hm(7.993)).toBe('8h');
  });

  it('turns a fractional hour into a clock time', () => {
    expect(clock(23.5)).toBe('23:30');
    expect(clock(7)).toBe('07:00');
    expect(clock(null)).toBe('—');
    // Bedtimes cross midnight and can be stored past 24 or below 0.
    expect(clock(25)).toBe('01:00');
    expect(clock(-1)).toBe('23:00');
  });
});

describe('the payload the widget parses', () => {
  it('is a separator no user-entered text can contain', () => {
    // A habit called "7/8" or an account with a currency symbol must not be
    // able to split a field in two. A control character cannot be typed.
    expect(SEP).toBe('');
  });

  it('always has the same number of fields, however few rows there are', () => {
    const full = encodePanel({ title: 'A', value: 'B', caption: 'C', rows: [['a', '1'], ['b', '2'], ['c', '3']] });
    const bare = encodePanel({ title: 'A', value: 'B', caption: 'C', rows: [] });
    expect(full.split(SEP)).toHaveLength(9);
    expect(bare.split(SEP)).toHaveLength(9);
  });

  it('pads missing rows with empty strings rather than dropping them', () => {
    const one = encodePanel({ title: 'A', value: 'B', caption: 'C', rows: [['x', 'y']] });
    expect(one.split(SEP)).toEqual(['A', 'B', 'C', 'x', 'y', '', '', '', '']);
  });

  it('holds the arity for every real panel', () => {
    setCurrency('EGP');
    const panels = buildPanels(state({ habits: [habit('1')], txns: [txn(-12.5)] }), now);
    for (const panel of Object.values(panels)) {
      expect(encodePanel(panel).split(SEP)).toHaveLength(9);
    }
  });

  it('names a preferences key for every panel it builds', () => {
    // A panel with no key is written nowhere, and that widget shows stale data
    // forever with nothing to indicate why.
    expect(Object.keys(buildPanels(state(), now)).sort()).toEqual(Object.keys(PANEL_KEYS).sort());
  });
});

describe('the panels themselves', () => {
  it('says "1 day", not "1 days"', () => {
    const checkins = [{ habitId: '1', day: '2026-08-05' }];
    const panels = buildPanels(state({ habits: [habit('1')], checkins }), now);
    expect(panels.habits.rows.find(([l]) => l === 'Longest streak')?.[1]).toBe('1 day');
  });

  it('counts only habits scheduled for today', () => {
    // Wednesday is index 3; the second habit is Sundays only.
    const panels = buildPanels(state({ habits: [habit('1'), habit('2', '1000000')] }), now);
    expect(panels.habits.value).toBe('0/1');
  });

  it('says something sane when there is no data at all', () => {
    const panels = buildPanels(state(), now);
    expect(panels.habits.value).toBe('—');
    expect(panels.sleep.value).toBe('—');
    expect(panels.workouts.value).toBe('0');
    // A stray undefined would reach the widget as the text "undefined".
    for (const panel of Object.values(panels)) {
      expect(typeof panel.title).toBe('string');
      expect(typeof panel.value).toBe('string');
      expect(typeof panel.caption).toBe('string');
      panel.rows.forEach(([label, value]) => {
        expect(typeof label).toBe('string');
        expect(typeof value).toBe('string');
      });
    }
  });

  it('formats money with the account currency, not a bare number', () => {
    setCurrency('EGP');
    const panels = buildPanels(state({ txns: [txn(-1234)] }), now);
    expect(panels.finance.value).not.toBe('1234');
    expect(panels.finance.value).toMatch(/1,?234/);
  });
});
