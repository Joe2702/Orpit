// Bank messages to ledger, end to end: the phone's reading (web/src/lib) and
// the server's bookkeeping together, against a real database. Each test is one
// thing a user would notice if it broke, usually as money counted twice.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

const H = 3_600_000;
const D = 24 * H;
// Recent, so everything is inside the state window and the recurring grace.
const T0 = Date.now() - 2 * D;
const user = async (name?: string) => new Client(server.base).signup(name);

test('a batch of bank messages becomes accounts, balances and entries, once', async () => {
  const c = await user();
  await c.importSms(
    [
      { sender: 'CIB', ts: T0, body: 'Your CIB debit card ending with 1234 was charged for EGP 450.00 at CARREFOUR MAADI CAIRO EG. Available balance EGP 12,550.00' },
      { sender: 'CIB', ts: T0 + 60_000, body: 'Your account **5678 has been debited with EGP 450.00. Available balance EGP 12,550.00' },
      { sender: 'CIB', ts: T0 + H, body: 'You have sent EGP 2,000.00 via InstaPay to account ending 9876. Fees EGP 2.00. Available balance EGP 10,548.00' },
      { sender: 'NBE', ts: T0 + H + 120_000, body: 'Your account 9876 has been credited with EGP 2,000.00 via InstaPay. Balance EGP 5,300.00' },
      { sender: 'CIB', ts: T0 + 3 * H, body: 'Refund of EGP 200.00 from AMAZON EG credited to your card 1234. Available balance EGP 10,748.00' },
      { sender: 'CIB', ts: T0 + 4 * H, body: 'Your CIB credit card ending 4444 was charged USD 10.00 at NETFLIX.COM. Available limit EGP 40,000.00' },
    ],
    { USD: { rate: 48.5, estimated: false } }
  );
  const s = c.state;

  // One account per bank, a credit card on its own, the hand-made Cash kept.
  assert.deepEqual(s.accounts.map((a) => a.name).sort(), ['CIB', 'CIB card ••4444', 'Cash', 'NBE']);
  // Balances are what the banks last said.
  assert.equal(c.balance('CIB'), 10748);
  assert.equal(c.balance('NBE'), 5300);
  assert.equal(c.balance('CIB card ••4444'), -485);

  const named = (n: string) => s.txns.filter((t) => t.name === n);
  // Card alert + account alert: one entry.
  assert.equal(named('Carrefour').length, 1);
  // Out of CIB, into NBE: one transfer, and its fee apart.
  const transfer = s.txns.find((t) => t.toAccId);
  assert.ok(transfer, 'a transfer');
  assert.equal(transfer!.amount, -2000);
  assert.equal(named('Transfer fee')[0]?.amount, -2);
  // A refund takes spending back without being income.
  const refund = named('Amazon')[0];
  assert.equal(refund.amount, 200);
  assert.equal(refund.income, false);
  // Categories that didn't exist were made.
  assert.ok(s.fcats.some((f) => f.name === 'Subscriptions'));
  assert.ok(s.fcats.some((f) => f.name === 'Fees'));

  // Reading the same messages again changes nothing.
  const before = JSON.stringify(s.txns.map((t) => [t.id, t.amount, t.cat]).sort());
  await c.importSms([
    { sender: 'CIB', ts: T0, body: 'Your CIB debit card ending with 1234 was charged for EGP 450.00 at CARREFOUR MAADI CAIRO EG. Available balance EGP 12,550.00' },
    { sender: 'CIB', ts: T0 + 60_000, body: 'Your account **5678 has been debited with EGP 450.00. Available balance EGP 12,550.00' },
  ]);
  assert.equal(JSON.stringify(c.state.txns.map((t) => [t.id, t.amount, t.cat]).sort()), before);
});

test('the halves of a transfer arriving in separate syncs still become one', async () => {
  const c = await user();
  await c.importSms([{ sender: 'CIB', ts: T0, body: 'You have sent EGP 1,500.00 via InstaPay to account ending 1111. Available balance EGP 3,500.00' }]);
  await c.importSms([{ sender: 'NBE', ts: T0 + 10 * 60_000, body: 'Your account 1111 has been credited with EGP 1,500.00 via InstaPay from CIB. Balance EGP 2,000.00' }]);
  const moves = c.state.txns.filter((t) => t.toAccId);
  assert.equal(moves.length, 1);
  assert.equal(c.state.txns.filter((t) => !t.toAccId && t.sms).length, 0);
  assert.equal(c.balance('CIB'), 3500);
  assert.equal(c.balance('NBE'), 2000);
});

test('an unproven transfer is asked about, and pairing it on request works', async () => {
  const c = await user();
  await c.importSms([
    { sender: 'CIB', ts: T0, body: 'You have sent EGP 500.00 via InstaPay to AHMED ALI. Available balance EGP 3,000.00' },
    { sender: 'VF-Cash', ts: T0 + 20 * 60_000, body: 'تم استلام مبلغ 500.00 جنيه من 01099999999. رصيدك الحالي 900.00 جنيه' },
  ]);
  const halves = c.state.txns.filter((t) => t.sms);
  assert.equal(halves.length, 2, 'both kept');
  assert.ok(halves.every((t) => t.review && t.pairKey));
  const out = halves.find((t) => t.amount < 0)!;
  const into = halves.find((t) => t.amount > 0)!;
  await c.call(`/api/txns/${out.id}/pair`, 'POST', { with: into.id });
  const moves = c.state.txns.filter((t) => t.toAccId);
  assert.equal(moves.length, 1);
  assert.equal(c.state.txns.filter((t) => t.sms && !t.toAccId).length, 0);
});

test("an edit survives a rescan, and the edited entry isn't overwritten", async () => {
  const c = await user();
  const msg = { sender: 'CIB', ts: T0, body: 'Your debit card ending 2222 was charged for EGP 120.00 at SOME SHOP. Available balance EGP 3,380.00' };
  await c.importSms([msg]);
  const t = c.state.txns.find((x) => x.amount === -120)!;
  await c.call(`/api/txns/${t.id}`, 'PATCH', { name: 'Gift for mum', cat: 'Shopping', amount: 120, income: false, accId: t.accId, ts: t.ts });
  await c.importSms([msg]);
  const after = c.state.txns.find((x) => x.id === t.id)!;
  assert.equal(after.name, 'Gift for mum');
  assert.equal(after.cat, 'Shopping');
  assert.equal(c.state.txns.filter((x) => x.amount === -120).length, 1);
});

test('a bank payment the user also typed in is asked about, and merges on "same"', async () => {
  const c = await user();
  const cash = c.account('Cash');
  await c.call('/api/txns', 'POST', { name: 'Food', cat: 'Food', amount: 450, income: false, accId: cash.id, ts: T0 + 2 * H, note: 'lunch with Omar' });
  await c.importSms([{ sender: 'CIB', ts: T0, body: 'Your CIB debit card ending with 1234 was charged for EGP 450.00 at CARREFOUR MAADI. Available balance EGP 9,000.00' }]);
  const imported = c.state.txns.find((t) => t.sms)!;
  assert.ok(imported.dupOf, 'flagged as maybe the typed one');
  assert.equal(imported.review, true);
  await c.call(`/api/txns/${imported.id}/same`, 'POST', { same: true });
  const left = c.state.txns.filter((t) => Math.abs(t.amount) === 450);
  assert.equal(left.length, 1, 'one payment left');
  assert.equal(left[0].name, 'Carrefour');
  assert.equal(left[0].cat, 'Food', "the user's category wins");
  assert.equal(left[0].note, 'lunch with Omar');
  assert.equal(left[0].review, false);
});

test('a recurring bill is paid by the bank message, not posted a second time', async () => {
  const c = await user();
  // Bank tracking on: CIB is linked once a message arrives.
  await c.importSms([{ sender: 'CIB', ts: T0 - D, body: 'Your account **5678 has been debited with EGP 50.00 at KIOSK. Available balance EGP 20,000.00' }]);
  const cib = c.account('CIB');
  await c.call('/api/recurring', 'POST', { name: 'Rent', cat: 'Housing', accId: cib.id, amount: 9500, freq: 'Monthly', income: false, nextTs: T0 });
  await c.call('/api/recurring', 'POST', { name: 'Gym', cat: 'Health', accId: cib.id, amount: 1100, freq: 'Monthly', income: false, nextTs: T0 });
  // The rent arrives from the bank a day late, by transfer to the landlord.
  await c.importSms([{ sender: 'CIB', ts: T0 + D, body: 'You have sent EGP 9,500.00 via InstaPay to MAHMOUD RENT. Available balance EGP 10,450.00' }]);
  const rent = c.state.recurring.find((r) => r.name === 'Rent')!;
  const gym = c.state.recurring.find((r) => r.name === 'Gym')!;
  const paidRent = c.state.txns.filter((t) => t.recurringId === rent.id);
  assert.equal(paidRent.length, 1, 'rent paid once');
  assert.equal(paidRent[0].sms, true, 'by the bank message');
  assert.ok(rent.nextTs! > Date.now(), 'and moved to next month');
  // The gym hasn't been seen yet: still waiting, nothing posted.
  assert.equal(c.state.txns.filter((t) => t.recurringId === gym.id).length, 0);
  assert.ok(gym.nextTs! < Date.now(), 'still due');
});

test('merging two accounts moves everything and drops transfers between them', async () => {
  const c = await user();
  await c.importSms([
    { sender: 'CIB', ts: T0, body: 'You have sent EGP 1,000.00 via InstaPay to account ending 1111. Available balance EGP 4,000.00' },
    { sender: 'NBE', ts: T0 + 5 * 60_000, body: 'Your account 1111 has been credited with EGP 1,000.00 via InstaPay. Balance EGP 6,000.00' },
    { sender: 'NBE', ts: T0 + H, body: 'Your account 1111 was debited with EGP 250.00 at PHARMACY. Balance EGP 5,750.00' },
  ]);
  const nbe = c.account('NBE');
  const cib = c.account('CIB');
  await c.call(`/api/accounts/${nbe.id}/merge`, 'POST', { into: cib.id });
  assert.equal(c.state.accounts.some((a) => a.id === nbe.id), false);
  assert.equal(c.state.txns.some((t) => t.toAccId), false, 'the transfer between them is gone');
  assert.ok(c.state.txns.some((t) => t.accId === cib.id && t.amount === -250), 'NBE entries moved');
  const links = c.account('CIB').smsLinks || [];
  assert.ok(links.some((l) => l.sender === 'NBE'), 'future NBE messages go to the merged account');
});
