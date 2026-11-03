import { describe, it, expect } from 'vitest';
import { analyseSms } from '../lib/smsParse';

// A declined, rejected or failed payment never moved money, so it must never
// reach the ledger, however the bank words it.

const read = (body: string, sender = 'CIB') => analyseSms({ id: '1', sender, body, ts: Date.UTC(2026, 10, 3, 9) });
const reason = (body: string, sender?: string) => {
  const a = read(body, sender);
  return a.ok ? 'imported' : a.reason;
};

describe('declined payments', () => {
  it.each([
    'Your CIB card ending with 1234 was declined for EGP 750.00 at AMAZON.EG due to insufficient funds.',
    'Transaction Declined: EGP 1,200.00 at CARREFOUR MAADI. Card **5678.',
    'Dear Customer, your purchase of EGP 450.00 at TALABAT was not approved.',
    'Your transaction of EGP 300.00 on card ending 4321 could not be completed.',
    'Txn of EGP 2,500.00 at NOON was unsuccessful. Available balance EGP 120.50.',
    'Your InstaPay transfer of EGP 1,000 to AHMED has failed.',
    'Purchase of USD 20.00 at NETFLIX.COM was rejected. Card ending 1111.',
    'Your payment of EGP 600 was not successful. Please try again.',
    'Card 9876: EGP 15,000.00 at B.TECH exceeds your available limit.',
    'Transaction denied: EGP 250.00 at UBER. Incorrect PIN entered.',
    'We were unable to process your payment of EGP 99.00 to VODAFONE.',
  ])('skips "%s"', (body) => {
    expect(reason(body)).toBe('declined');
  });

  it.each([
    'تم رفض عملية شراء بمبلغ 750 جنيه من بطاقتك المنتهية ب 1234 لدى امازون',
    'عملية مرفوضة: رصيد غير كاف لإتمام عملية شراء بمبلغ 500 جنيه',
    'عذرا، لم يتم تنفيذ عملية تحويل بمبلغ 1,000 جنيه من حسابك',
    'لم تتم عملية السحب بمبلغ 2000 ج.م من بطاقتك رقم 5678',
    'فشلت عملية الدفع بمبلغ 300 جنيه لعدم كفاية الرصيد',
    'عملية شراء غير ناجحة بقيمة 450 جنيه لدى طلبات',
    'محاولة سحب 1500 جنيه غير مقبولة، الرصيد لا يكفي',
  ])('skips the Arabic "%s"', (body) => {
    expect(reason(body, 'NBE')).toBe('declined');
  });

  it.each([
    'Your CIB card ending with 1234 was charged EGP 750.00 at AMAZON.EG. If this was not authorised by you, call 19666.',
    'EGP 1,200.00 purchase at CARREFOUR MAADI on card **5678. Not you? Call us.',
    'Refund of EGP 300.00 for your cancelled order at NOON has been credited to your card ending 1111.',
    'تم خصم 750 جنيه من بطاقتك المنتهية ب 1234 لدى امازون. إذا لم تقم بهذه العملية اتصل بنا',
  ])('still imports a real payment: "%s"', (body) => {
    expect(reason(body, body.match(/[؀-ۿ]/) ? 'NBE' : 'CIB')).toBe('imported');
  });
});
