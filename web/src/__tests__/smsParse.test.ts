import { describe, it, expect } from 'vitest';
import { parseSms, parseAll, smsKey, guessCategory, type SmsMessage } from '../lib/smsParse';

// Reading bank messages.
//
// Two failure modes are pinned hardest here, because both are silent:
//   * importing the *balance* instead of the payment — every message ends with
//     a bigger number than the one that matters;
//   * importing something that was never a payment — an OTP is six digits from
//     the bank's own sender id.
// Everything else is a name being slightly wrong, which the user can see and fix.

const TS = new Date(2026, 7, 10, 14, 32).getTime();
const sms = (body: string, sender = 'CIB', ts = TS): SmsMessage => ({ id: '1', sender, body, ts });

describe('the amount', () => {
  it('takes the payment, not the balance that follows it', () => {
    const p = parseSms(sms('Your account XXXX1234 has been debited with EGP 250.00 at CARREFOUR. Available balance EGP 12,345.67'));
    expect(p?.amount).toBe(250);
  });

  it('is not fooled when the balance comes first', () => {
    const p = parseSms(sms('Available balance EGP 12,345.67. A purchase of EGP 250.00 was made at SPINNEYS.'));
    expect(p?.amount).toBe(250);
  });

  it('ignores a fee quoted beside the payment', () => {
    const p = parseSms(sms('You have sent EGP 1,000.00 to AHMED HASSAN. Fee EGP 5.00. Your balance is EGP 3,000.00'));
    expect(p?.amount).toBe(1000);
  });

  it('reads thousands separators and both currency positions', () => {
    expect(parseSms(sms('Purchase of EGP 1,234.56 at IKEA'))?.amount).toBe(1234.56);
    expect(parseSms(sms('You have transferred 200 EGP to 01012345678'))?.amount).toBe(200);
  });

  it('treats L.E. as pounds', () => {
    const p = parseSms(sms('Payment of L.E. 75.50 at CILANTRO'));
    expect(p).toMatchObject({ amount: 75.5, currency: 'EGP' });
  });

  it('keeps a foreign currency as it was written', () => {
    expect(parseSms(sms('Purchase of USD 30.00 at APPLE.COM/BILL'))?.currency).toBe('USD');
  });

  it('takes the converted figure when the bank quotes both currencies', () => {
    // Recording 30 where 1,450 belongs understates the month by the whole
    // exchange rate, and nothing downstream would ever notice.
    const p = parseSms(sms('Purchase of USD 30.00 (EGP 1,450.00) at APPLE.COM/BILL'));
    expect(p).toMatchObject({ amount: 1450, currency: 'EGP' });
  });

  it('gives up rather than guessing when there is no amount', () => {
    expect(parseSms(sms('Your card has been activated successfully.'))).toBeNull();
  });
});

describe('what is not a transaction', () => {
  it('refuses a one-time password', () => {
    expect(parseSms(sms('Your OTP is 458213. Do not share it with anyone.'))).toBeNull();
    expect(parseSms(sms('123456 is your verification code for a purchase of EGP 900 at NOON'))).toBeNull();
  });

  it('refuses a declined payment', () => {
    expect(parseSms(sms('Your payment of EGP 500 at CARREFOUR was declined due to insufficient funds.'))).toBeNull();
  });

  it('refuses a request for money, which is not money moving', () => {
    expect(parseSms(sms('You have a payment request from AHMED for EGP 300 on InstaPay.'))).toBeNull();
  });

  it('refuses a bill reminder, which has not been paid yet', () => {
    expect(parseSms(sms('Your credit card statement is ready. Amount due EGP 4,500 on 20/08/2026.'))).toBeNull();
    expect(parseSms(sms('EGP 1,200 will be debited from your account for your loan instalment.'))).toBeNull();
  });

  it('refuses marketing', () => {
    expect(parseSms(sms('Special offer! Get EGP 500 cashback on your next purchase. Apply now.'))).toBeNull();
  });

  it('refuses a message with money but no verb — a bank always says what happened', () => {
    expect(parseSms(sms('Your card limit is EGP 50,000.'))).toBeNull();
  });
});

describe('which way the money went', () => {
  it('reads a purchase as spending', () => {
    expect(parseSms(sms('A purchase of EGP 250.00 was made on your card ending 1234 at STARBUCKS'))?.income).toBe(false);
  });

  it('reads a salary as income', () => {
    expect(parseSms(sms('Your account has been credited with EGP 18,000.00 - SALARY'))?.income).toBe(true);
  });

  it('reads a refund as income even though it mentions a purchase', () => {
    const p = parseSms(sms('EGP 250.00 has been refunded to your card ending 1234 for a purchase at ZARA'));
    expect(p?.income).toBe(true);
  });

  it('reads money sent and money received on the same wallet', () => {
    expect(parseSms(sms('You have sent EGP 500 to 01012345678'), 'VodafoneCash')?.income).toBe(false);
    expect(parseSms(sms('You have received EGP 500 from 01012345678'), 'VodafoneCash')?.income).toBe(true);
  });

  it('treats an ATM withdrawal as spending', () => {
    expect(parseSms(sms('EGP 2,000.00 withdrawn from ATM at NASR CITY. Available balance EGP 8,000'))?.income).toBe(false);
  });
});

describe('who was paid', () => {
  it('takes the shop after "at", without the trailing date', () => {
    const p = parseSms(sms('A purchase of EGP 250.00 was made at STARBUCKS ZAMALEK on 10-Aug-2026'));
    expect(p?.merchant).toBe('Starbucks Zamalek');
  });

  it('takes the person after "to" when money is sent', () => {
    expect(parseSms(sms('You have sent EGP 1,000 to AHMED HASSAN via InstaPay'))?.merchant).toBe('Ahmed Hassan');
  });

  it('takes the sender after "from" when money arrives', () => {
    expect(parseSms(sms('You have received EGP 1,000 from MONA SAID'))?.merchant).toBe('Mona Said');
  });

  it('does not mistake a time or a phone number for a name', () => {
    const p = parseSms(sms('EGP 300 debited at 14:35 from your account XXXX9876'));
    expect(p?.merchant).not.toMatch(/14/);
  });

  it('softens the shouting the card networks send, keeping short acronyms', () => {
    // Merchant strings arrive in capitals. Title case sits better beside
    // hand-typed entries; words of three letters or fewer are left alone
    // because those are far more often initials than words.
    expect(parseSms(sms('Purchase of EGP 400 at ABC PHARMACY'))?.merchant).toBe('ABC Pharmacy');
    expect(parseSms(sms('Purchase of EGP 400 at KFC MAADI'))?.merchant).toBe('KFC Maadi');
  });

  it('falls back to the sender when the message names nobody', () => {
    expect(parseSms(sms('EGP 150.00 has been debited.', 'NBE'))?.merchant).toBe('NBE');
  });

  it('drops reference numbers from the name', () => {
    const p = parseSms(sms('You have sent EGP 250 to AHMED HASSAN Ref 8891234'));
    expect(p?.merchant).toBe('Ahmed Hassan');
  });
});

describe('the card', () => {
  it('reads the last four digits however they are written', () => {
    expect(parseSms(sms('Purchase EGP 100 on card ending 1234 at X SHOP'))?.card).toBe('1234');
    expect(parseSms(sms('Purchase EGP 100 on card ****5678 at X SHOP'))?.card).toBe('5678');
    expect(parseSms(sms('Your account XXXX9012 has been debited EGP 100 at X SHOP'))?.card).toBe('9012');
  });

  it('is null when the message does not say', () => {
    expect(parseSms(sms('You have sent EGP 100 to AHMED'))?.card).toBeNull();
  });
});

describe('identity', () => {
  it('gives the same message the same key every time', () => {
    const m = { sender: 'CIB', body: 'Purchase of EGP 100 at SHOP', ts: TS };
    expect(smsKey(m)).toBe(smsKey({ ...m, body: '  Purchase of EGP 100 at SHOP  ' }));
  });

  it('separates two identical payments made at different times', () => {
    const body = 'Purchase of EGP 100 at SHOP';
    expect(smsKey({ sender: 'CIB', body, ts: TS })).not.toBe(smsKey({ sender: 'CIB', body, ts: TS + 60000 }));
  });

  it('drops a message that appears twice in one batch', () => {
    const m = sms('Purchase of EGP 100 at SHOP');
    expect(parseAll([m, { ...m, id: '2' }])).toHaveLength(1);
  });

  it('keeps two genuinely different payments in one batch', () => {
    expect(
      parseAll([sms('Purchase of EGP 100 at SHOP'), sms('Purchase of EGP 250 at OTHER SHOP', 'CIB', TS + 1000)])
    ).toHaveLength(2);
  });
});

describe('choosing a category', () => {
  const cats = ['Groceries', 'Transport', 'Food', 'Bills', 'Other', 'Salary', 'Income'];

  it('follows what the user did with this merchant before', () => {
    const history = [{ name: 'Uber', cat: 'Bills', income: false }];
    // Deliberately a "wrong" category: the user's own filing beats the table.
    expect(guessCategory('Uber', false, history, cats)).toBe('Bills');
  });

  it('uses the keyword table for a merchant never seen', () => {
    expect(guessCategory('Carrefour Maadi', false, [], cats)).toBe('Groceries');
    expect(guessCategory('Uber Trip', false, [], cats)).toBe('Transport');
  });

  it('only offers categories the user actually has', () => {
    expect(guessCategory('Carrefour', false, [], ['Food', 'Other'])).toBe('Other');
  });

  it('does not reuse an expense category for income', () => {
    const history = [{ name: 'Ahmed', cat: 'Transport', income: false }];
    expect(guessCategory('Ahmed', true, history, cats)).toBe('Income');
  });

  it('ignores a previous entry that was itself left uncategorised', () => {
    const history = [{ name: 'Uber', cat: 'Other', income: false }];
    expect(guessCategory('Uber', false, history, cats)).toBe('Transport');
  });
});

describe('formats seen in the wild', () => {
  const cases: [string, string, { amount: number; income: boolean; merchant?: string }][] = [
    [
      'NBE',
      'Dear Customer, your account 1234 has been debited with EGP 350.00 on 10/08/2026 at CARREFOUR MAADI. Available balance is EGP 9,876.54',
      { amount: 350, income: false, merchant: 'Carrefour Maadi' },
    ],
    [
      'CIB',
      'A purchase of EGP 189.75 was made on your card ending 4321 at TSEPPAS on 10-Aug-2026. Avail bal EGP 4,210.00',
      { amount: 189.75, income: false, merchant: 'Tseppas' },
    ],
    [
      'InstaPay',
      'You have successfully sent EGP 2,500.00 to MOHAMED SAID. Ref 998877. Your available balance is EGP 7,500.00',
      { amount: 2500, income: false, merchant: 'Mohamed Said' },
    ],
    [
      'VodafoneCash',
      'You have received 300 EGP from 01001234567. Your new balance is 1,450 EGP',
      { amount: 300, income: true },
    ],
    [
      'QNB',
      'ATM withdrawal of EGP 1,000.00 from your account XXXX7788. Current balance EGP 22,300.10',
      { amount: 1000, income: false },
    ],
    [
      'BanqueMisr',
      'Your account has been credited with EGP 20,000.00 being SALARY for AUG 2026. Balance EGP 21,450.00',
      { amount: 20000, income: true },
    ],
  ];

  for (const [sender, body, want] of cases) {
    it(`reads a ${sender} message`, () => {
      const p = parseSms(sms(body, sender));
      expect(p).toBeTruthy();
      expect(p!.amount).toBe(want.amount);
      expect(p!.income).toBe(want.income);
      if (want.merchant) expect(p!.merchant).toBe(want.merchant);
    });
  }
});
