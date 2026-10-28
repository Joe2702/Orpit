import { describe, it, expect } from 'vitest';
import { analyseSms, type SmsMessage } from '../lib/smsParse';
import { buildRows, accountBalance, accountForLink } from '../lib/ledger';
import { cleanMerchant, canonicalFor, categoryFor, linkFor } from '../lib/merchants';
import type { Account, AppState, Txn } from '../types';

// From bank messages to a ledger that agrees with the bank.
//
// What matters most here is never counting money twice: the card alert and the
// account alert for one purchase, the two halves of a transfer between the
// user's own accounts, the same messages read again on a rescan. Each of those
// silently doubles spending or income if it slips through.

const T0 = Date.UTC(2026, 9, 20, 10, 0);
const MIN = 60_000;

const read = (body: string, sender = 'CIB', ts = T0) => {
  const a = analyseSms({ id: '1', sender, body, ts } as SmsMessage, 'EGP');
  if (!a.ok) throw new Error(`not read: ${body} (${a.reason})`);
  return { p: a.parsed, sender };
};

const FCATS = [
  ['Food', 'expense'],
  ['Transport', 'expense'],
  ['Housing', 'expense'],
  ['Fun', 'expense'],
  ['Health', 'expense'],
  ['Shopping', 'expense'],
  ['Salary', 'income'],
  ['Freelance', 'income'],
  ['Other', 'income'],
].map(([name, kind], i) => ({ id: String(i), name, kind, icon: 'other', color: 'blue' }));

function state(accounts: Account[] = [], txns: Txn[] = []): AppState {
  return { accounts, txns, fcats: FCATS } as unknown as AppState;
}
const acc = (id: string, name: string, links: [string, string | null][] = [], type = 'Bank', extra: Partial<Account> = {}): Account => ({
  id,
  name,
  type,
  color: 'blue',
  opening: 0,
  smsLinks: links.map(([sender, card]) => ({ sender, card })),
  ...extra,
});
const txn = (t: Partial<Txn>): Txn =>
  ({ id: 't', name: 'x', cat: 'Other', amount: -1, income: false, accId: null, toAccId: null, adjust: false, note: null, photo: false, ts: T0, ...t }) as Txn;

describe('reading more than the amount', () => {
  it('keeps the balance the bank reported, not just the payment', () => {
    const { p } = read('Your account **5678 has been debited with EGP 450.00. Available balance EGP 12,550.00');
    expect(p.amount).toBe(450);
    expect(p.balance).toBe(12550);
  });

  it('notes the fee on a transfer', () => {
    const { p } = read('You have sent EGP 2,000.00 via InstaPay to MOHAMED A. Fees EGP 2.00. Available balance EGP 10,548.00');
    expect(p.amount).toBe(2000);
    expect(p.fee).toBe(2);
    expect(p.transfer).toBe(true);
  });

  it('knows a cash withdrawal, a refund and a salary', () => {
    expect(read('Cash withdrawal of EGP 1,000.00 from ATM using card 1234.').p.atm).toBe(true);
    const refund = read('Refund of EGP 200.00 from AMAZON EG credited to your card 1234.').p;
    expect(refund.income && refund.refund).toBe(true);
    expect(read('Your account 9876 has been credited with salary EGP 25,000.00.', 'NBE').p.salary).toBe(true);
  });

  it('tells a credit card from a debit card', () => {
    expect(read('Your CIB credit card ending 4444 was charged EGP 99.00 at NETFLIX.COM').p.instrument).toBe('credit');
    expect(read('Your debit card ending 1234 was charged for EGP 99.00 at SHOP').p.instrument).toBe('card');
  });

  it("doesn't take the other side's account number for the user's own", () => {
    const { p } = read('You have sent EGP 1,500.00 via InstaPay to account ending 1111. Available balance EGP 3,500.00');
    expect(p.card).toBeNull();
  });
});

describe('merchant names and categories', () => {
  it('turns terminal names into the names people use', () => {
    expect(cleanMerchant('POS CARREFOUR MAADI 0042 CAIRO EG')).toBe('Carrefour');
    expect(cleanMerchant('UBER *TRIP HELP.UBER.COM')).toBe('Uber');
    expect(cleanMerchant('XYZ TRADING CO #1234 CAIRO')).toBe('XYZ TRADING CO');
  });

  it('files known brands, and falls back to words in the name', () => {
    expect(canonicalFor('Carrefour', { income: false })).toBe('Groceries');
    expect(canonicalFor('Vodafone', { income: false })).toBe('Bills');
    expect(canonicalFor('EL NOUR PHARMACY', { income: false })).toBe('Health');
    expect(canonicalFor('Somebody', { income: false, atm: true })).toBe('Cash');
    expect(canonicalFor('Somebody', { income: true, salary: true })).toBe('Salary');
  });

  it("uses the user's own category when one fits", () => {
    expect(categoryFor('Groceries', ['Food', 'Transport'])).toBe('Food');
    expect(categoryFor('Groceries', ['Groceries', 'Food'])).toBe('Groceries');
    // Nothing fits: the canonical name, which the server creates.
    expect(categoryFor('Bills', ['Food'])).toBe('Bills');
  });

  it('names an account for the bank, and a credit card for the card', () => {
    expect(linkFor('CIB', '1234', 'card').label).toBe('CIB');
    expect(linkFor('CIB', '4444', 'credit')).toMatchObject({ label: 'CIB card ••4444', type: 'Credit card' });
    expect(linkFor('VF-Cash', null, null)).toMatchObject({ label: 'Vodafone Cash', type: 'Wallet' });
  });
});

describe('which account a message belongs to', () => {
  const accounts = [acc('1', 'CIB', [['CIB', null], ['CIB', '1234']]), acc('2', 'CIB card', [['CIB', '4444']], 'Credit card')];

  it('matches the same sender and card', () => {
    expect(accountForLink(accounts, linkFor('CIB', '4444', 'credit'))?.id).toBe('2');
  });

  it("puts a new debit card with the bank's one account", () => {
    expect(accountForLink(accounts, linkFor('CIB', '7777', 'card'))?.id).toBe('1');
  });

  it('never puts a new credit card in the bank account', () => {
    expect(accountForLink(accounts, linkFor('CIB', '8888', 'credit'))).toBeNull();
  });
});

describe('building ledger rows', () => {
  const opts = (s = state(), fx = {}) => ({ home: 'EGP', state: s, fx });

  it('records the card alert and the account alert for one purchase once', () => {
    const rows = buildRows(
      [
        read('Your CIB debit card ending with 1234 was charged for EGP 450.00 at CARREFOUR MAADI. Available balance EGP 12,550.00'),
        read('Your account **5678 has been debited with EGP 450.00. Available balance EGP 12,550.00', 'CIB', T0 + MIN),
      ],
      opts()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Carrefour', cat: 'Food', amount: 450, balance: 12550 });
    expect(rows[0].alsoKeys).toHaveLength(1);
  });

  it('turns money out of one account and into another into one transfer, fee apart', () => {
    const rows = buildRows(
      [
        read('You have sent EGP 2,000.00 via InstaPay to account ending 9876. Fees EGP 2.00. Available balance EGP 10,548.00', 'CIB'),
        read('Your account 9876 has been credited with EGP 2,000.00 via InstaPay. Balance EGP 5,300.00', 'NBE', T0 + 2 * MIN),
      ],
      opts()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cat: 'Transfer', amount: 2000, fee: 2, feeCat: 'Fees', toBalance: 5300, toTs: T0 + 2 * MIN });
    expect(rows[0].toLink?.sender).toBe('NBE');
  });

  it('asks instead of pairing when nothing proves both accounts are yours', () => {
    // Sent to a friend from CIB, and someone else sent the same amount to the
    // wallet half an hour later: same amount, close in time, not a transfer.
    const rows = buildRows(
      [
        read('You have sent EGP 500.00 via InstaPay to AHMED ALI. Available balance EGP 3,000.00', 'CIB'),
        read('تم استلام مبلغ 500.00 جنيه من 01099999999. رصيدك الحالي 900.00 جنيه', 'VF-Cash', T0 + 30 * MIN),
      ],
      opts()
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.review && r.pairKey)).toBe(true);
    expect(rows[0].pairKey).toBe(rows[1].key);
    expect(rows.some((r) => r.toLink)).toBe(false);
  });

  it('pairs when the money went to the user by name', () => {
    const s = { ...state(), profile: { name: 'Youssif Mohammed' } } as unknown as AppState;
    const rows = buildRows(
      [
        read('You have sent EGP 500.00 via InstaPay to YOUSSIF MOHAMMED. Available balance EGP 3,000.00', 'CIB'),
        read('تم استلام مبلغ 500.00 جنيه من 01099999999. رصيدك الحالي 900.00 جنيه', 'VF-Cash', T0 + 5 * MIN),
      ],
      opts(s)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].toLink?.sender).toBe('Vodafone Cash');
  });

  it('pairs between two accounts the user has moved money between before', () => {
    const cib = acc('1', 'CIB', [['CIB', null]]);
    const wallet = acc('2', 'Vodafone Cash', [['Vodafone Cash', null]], 'Wallet');
    const before = txn({ id: '9', accId: '1', toAccId: '2', amount: -100, ts: T0 - 30 * 86_400_000 });
    const rows = buildRows(
      [
        read('You have sent EGP 500.00 via InstaPay. Available balance EGP 3,000.00', 'CIB'),
        read('تم استلام مبلغ 500.00 جنيه. رصيدك الحالي 900.00 جنيه', 'VF-Cash', T0 + 5 * MIN),
      ],
      opts(state([cib, wallet], [before]))
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].toLink).toBeTruthy();
  });

  it("doesn't pair two unrelated card payments of the same amount", () => {
    const rows = buildRows(
      [
        read('Your debit card ending 1234 was charged for EGP 300.00 at SOME SHOP', 'CIB'),
        read('Your account 9876 has been credited with EGP 300.00 from SALARY CO', 'NBE', T0 + 5 * MIN),
      ],
      opts()
    );
    expect(rows).toHaveLength(2);
  });

  it('converts a foreign payment, and asks for a look when the rate is a guess', () => {
    const msg = read('Your CIB credit card ending 4444 was charged USD 10.00 at NETFLIX.COM');
    const live = buildRows([msg], opts(state(), { USD: { rate: 48.5, estimated: false } }))[0];
    expect(live).toMatchObject({ amount: 485, review: false, cat: 'Subscriptions' });
    expect(live.note).toContain('USD 10');
    expect(buildRows([msg], opts(state(), { USD: { rate: 48, estimated: true } }))[0].review).toBe(true);
    const none = buildRows([msg], opts())[0];
    expect(none.review).toBe(true);
    expect(none.note).toContain('not converted');
  });

  it('moves an ATM withdrawal into the cash account instead of counting it as spending', () => {
    const cash = acc('9', 'Cash', [], 'Cash');
    const row = buildRows([read('Cash withdrawal of EGP 1,000.00 from ATM using card 1234.')], opts(state([cash])))[0];
    expect(row).toMatchObject({ toAccId: '9', cat: 'Transfer', name: 'Cash withdrawal' });
  });

  it('keeps a refund as money back, not income', () => {
    const row = buildRows([read('Refund of EGP 200.00 from AMAZON EG credited to your card 1234.')], opts())[0];
    expect(row).toMatchObject({ refund: true, income: false, cat: 'Shopping', name: 'Amazon' });
  });

  it('learns from what the user chose, not from its own guesses', () => {
    const msg = read('Your debit card ending 1234 was charged for EGP 80.00 at XYZ TRADING CO');
    const mine = txn({ name: 'XYZ Trading Co', cat: 'Housing', auto: false });
    expect(buildRows([msg], opts(state([], [mine])))[0]).toMatchObject({ cat: 'Housing', review: false });
    const guess = txn({ name: 'XYZ Trading Co', cat: 'Housing', auto: true, sms: true });
    expect(buildRows([msg], opts(state([], [guess])))[0]).toMatchObject({ cat: 'Other', review: true });
  });

  it('knows a payment already recorded from another message', () => {
    const cib = acc('1', 'CIB', [['CIB', null]]);
    const prior = txn({ id: '50', sms: true, smsKey: 'other', accId: '1', amount: -120, ts: T0 });
    const row = buildRows([read('Your account **9999 has been debited with EGP 120.00.', 'CIB', T0 + MIN)], opts(state([cib], [prior])))[0];
    expect(row.dupOf).toBe('50');
  });

  it('is not a duplicate of itself when the same messages are read again', () => {
    const cib = acc('1', 'CIB', [['CIB', null]]);
    const msg = read('Your account **9999 has been debited with EGP 120.00.');
    const prior = txn({ id: '50', sms: true, smsKey: msg.p.key, accId: '1', amount: -120 });
    expect(buildRows([msg], opts(state([cib], [prior])))[0].dupOf).toBeUndefined();
  });

  it('finds the other half of a transfer imported earlier', () => {
    const cib = acc('1', 'CIB', [['CIB', null]]);
    const out = txn({ id: '61', sms: true, smsKey: 'k', accId: '1', amount: -1500, ts: T0 });
    const row = buildRows(
      [read('Your account 1111 has been credited with EGP 1,500.00 via InstaPay from CIB. Balance EGP 2,000.00', 'NBE', T0 + 10 * MIN)],
      opts(state([cib], [out]))
    )[0];
    expect(row.pairOf).toBe('61');
  });

  it('asks about an earlier half when nothing proves it', () => {
    const cib = acc('1', 'CIB', [['CIB', null]]);
    const out = txn({ id: '61', sms: true, smsKey: 'k', accId: '1', amount: -1500, ts: T0 });
    const row = buildRows(
      [read('Your account 1111 has been credited with EGP 1,500.00 via InstaPay. Balance EGP 2,000.00', 'NBE', T0 + 10 * MIN)],
      opts(state([cib], [out]))
    )[0];
    expect(row.pairOf).toBeUndefined();
    expect(row).toMatchObject({ pairKey: 'k', review: true });
  });

  it('asks whether a bank payment is one the user already typed in', () => {
    const typed = txn({ id: '70', name: 'Food', cat: 'Food', accId: 'cash', amount: -450, ts: T0 + 2 * 3_600_000 });
    const row = buildRows(
      [read('Your CIB debit card ending with 1234 was charged for EGP 450.00 at CARREFOUR MAADI.')],
      opts(state([], [typed]))
    )[0];
    expect(row).toMatchObject({ maybeSameAs: '70', review: true, name: 'Carrefour' });
  });

  it('claims a typed entry for one bank payment only', () => {
    const typed = txn({ id: '70', amount: -100, ts: T0 });
    const rows = buildRows(
      [
        read('Your debit card ending 1234 was charged for EGP 100.00 at SHOP ONE'),
        read('Your debit card ending 1234 was charged for EGP 100.00 at SHOP TWO', 'CIB', T0 + 60 * MIN),
      ],
      opts(state([], [typed]))
    );
    expect(rows.filter((r) => r.maybeSameAs)).toHaveLength(1);
  });

  it('gives a name to a payment that only said which account', () => {
    const row = buildRows([read('You have sent EGP 1,500.00 via InstaPay to account ending 1111.')], opts())[0];
    expect(row.name).toBe('Money sent');
  });
});

describe('account balance', () => {
  const t = (amount: number, ts: number, extra: Partial<Txn> = {}) => txn({ accId: 'a', amount, ts, ...extra });

  it('is the bank-reported balance plus only what came after it', () => {
    const a = acc('a', 'CIB', [], 'Bank', { opening: 99999, smsBalance: 1000, smsBalanceTs: T0 });
    const all = [t(-200, T0 - MIN), t(-50, T0), t(-30, T0 + MIN), txn({ toAccId: 'a', accId: 'b', amount: -100, ts: T0 + 2 * MIN })];
    expect(accountBalance(a, all)).toBe(1000 - 30 + 100);
  });

  it('is opening plus everything without one', () => {
    const a = acc('a', 'Cash', [], 'Cash', { opening: 500 });
    expect(accountBalance(a, [t(-200, T0), t(100, T0, { income: true })], 50)).toBe(450);
  });
});
