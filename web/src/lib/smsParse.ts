// Reading a bank's SMS and turning it into a transaction.
//
// Banks do not publish these formats and change them without telling anyone, so
// nothing here is a per-bank template — those rot. It is one generic reader:
// find the money, work out which way it went, and take whoever is named beside
// it. That degrades gracefully. A format we have never seen still produces the
// amount and the direction, which are the two things that matter; only the
// merchant name suffers, and the user can fix a name in two taps.
//
// It reads English and Arabic. Egyptian banks and wallets send a large share of
// their alerts in Arabic, frequently with Arabic-Indic digits ("١٬٢٥٠٫٠٠") and
// invisible direction marks wrapped round the numbers. The first version of
// this file read English only — and leaned on `\b`, which in JavaScript only
// knows Latin letters — so those messages were never even candidates. Every
// message now goes through one normalisation step before anything looks at it.
//
// The rule that governs every decision below: **a wrong entry costs more than a
// missing one**. A payment that quietly doesn't import is noticed the moment
// somebody looks at the day's spending. A duplicate, or a balance imported as
// though it were a purchase, silently corrupts the ledger and every total drawn
// from it. So the reader would rather return null than guess.

export interface SmsMessage {
  /** The provider's row id. Not trusted for identity — see `smsKey`. */
  id: string;
  sender: string;
  body: string;
  /** When the message arrived, in ms. */
  ts: number;
}

export interface ParsedSms {
  /** Stable across re-reads, reinstalls and second devices. */
  key: string;
  /** Always positive. The direction is carried by `income`. */
  amount: number;
  currency: string;
  income: boolean;
  /** Who was paid, or who paid. Already tidied for display. */
  merchant: string;
  /** Last four digits of the card or account, when the message says. */
  card: string | null;
  ts: number;
  /** The original text, kept so the user can check what was read. */
  body: string;
  /**
   * What the message says is left in the account afterwards, when it says so
   * in the payment's own currency. The single most useful number in a bank
   * message after the amount: it is what keeps the app's balance equal to the
   * bank's, whatever was missed or typed by hand in between.
   */
  balance: number | null;
  /** Fees charged on top of the amount ("fees EGP 5"). */
  fee: number;
  /** Cash out of a machine: money moving into the user's pocket, not spent. */
  atm: boolean;
  /** Money coming back for an earlier purchase, rather than income. */
  refund: boolean;
  /** Salary or payroll. */
  salary: boolean;
  /** Money moving between accounts or people: InstaPay, a transfer, a wallet send. */
  transfer: boolean;
  /** What the money moved through, when the message says. */
  instrument: 'credit' | 'wallet' | 'card' | 'account' | null;
}

/** Why a message was not imported — shown in the on-device diagnostic. */
export type SkipReason = 'empty' | 'otp' | 'promo' | 'declined' | 'not-yet' | 'request' | 'no-amount' | 'no-verb';

export const SKIP_LABEL: Record<SkipReason, string> = {
  empty: 'Empty message',
  otp: 'Security code, ignored',
  promo: 'Promotion, ignored',
  declined: 'Declined payment, ignored',
  'not-yet': 'Reminder or future charge, ignored',
  request: 'Payment request, ignored',
  'no-amount': 'No amount found',
  'no-verb': "Couldn't tell if money went in or out",
};

// ---------------------------------------------------------------------------
// Normalisation

/**
 * Make a message machine-readable without changing what it says.
 *
 * - Arabic-Indic and Persian digits become 0–9, and the Arabic decimal and
 *   thousands separators become "." and ",".
 * - Diacritics and the tatweel stretch are dropped.
 * - Bidi control characters are removed. Banks put these round numbers so they
 *   render left-to-right inside Arabic text, and they sit invisibly between
 *   "250.00" and "جنيه", so a pattern expecting a space finds something else.
 */
export function basicNormalize(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The string every pattern is matched against.
 *
 * Strictly one character in, one character out, so a position found here is the
 * same position in the display string — that is how merchant names are cut from
 * the readable text after being located in the normalised one. For the same
 * reason it uppercases ASCII by hand: `toUpperCase` turns "ß" into "SS" and
 * would shift every index after it.
 */
function forMatching(s: string): string {
  return s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[a-z]/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Money

const CUR_LATIN = 'EGP|USD|EUR|GBP|SAR|AED|KWD|QAR|OMR|BHD|JOD|TRY|L\\.E\\.?|LE';
// Matched against normalised text, so "جنية" (a very common spelling) has
// already become "جنيه", and "ج.م" / "جم" are the two usual abbreviations.
const CUR_AR = 'جنيهات|جنيها|جنيه|ج\\.م\\.?|ج م|جم|دولار|يورو|ريال|درهم';
const CUR = `(?:${CUR_LATIN}|${CUR_AR})`;

// Not preceded by a digit, a Latin letter or a separator. An Arabic letter is
// allowed: "بمبلغ150" happens, and that "ب" is a preposition, not part of the
// number.
const NB = '(?<![0-9A-Z.,])';
const NE = '(?![0-9])';
const LB = '(?<![\\p{L}\\p{N}])';
const LE_ = '(?![\\p{L}\\p{N}])';
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?';

function normCurrency(c: string): string {
  const u = c.replace(/[.\s]/g, '');
  if (u === 'LE' || u === 'EGP' || u.startsWith('جنيه') || u === 'جم') return 'EGP';
  if (u === 'دولار') return 'USD';
  if (u === 'يورو') return 'EUR';
  if (u === 'ريال') return 'SAR';
  if (u === 'درهم') return 'AED';
  return u.toUpperCase();
}

const AMOUNT = new RegExp(
  `${LB}(${CUR})${LE_}\\s*${NB}(${NUM})${NE}|${NB}(${NUM})${NE}\\s*${LB}(${CUR})${LE_}`,
  'gu'
);

/**
 * "An amount of 250.00" with no currency at all.
 *
 * Some banks omit the currency in their Arabic alerts ("تم خصم مبلغ 250.00 من
 * حسابك"). The word for "amount" right before a number is as clear a signal as
 * a currency code, so it is accepted — in the user's own currency, since a bank
 * that names no currency is charging in the local one.
 */
const BARE_AMOUNT = new RegExp(`(?:بمبلغ|مبلغ|بقيمه|قيمته|AMOUNT(?: OF)?)\\s*:?\\s*${NB}(${NUM})${NE}`, 'u');

/**
 * Amounts that are not the transaction's amount.
 *
 * Nearly every bank message ends by telling you what is left in the account,
 * and that number is larger than the payment and sits in the same sentence.
 * Reading it as the payment is the single worst thing this file could do, so
 * those clauses are cut out of the text before any amount is looked for.
 */
const BALANCE_CLAUSE = new RegExp(
  `(?:\\b(?:AVAIL(?:ABLE)?|CURRENT|NEW|REMAINING|LEDGER|CLOSING|RUNNING|TOTAL)?\\.?\\s*BAL(?:ANCE)?\\b|الرصيد|رصيد)` +
    `[^\\d]{0,25}(?:${CUR})?\\s*(?:${NUM})\\s*(?:${CUR})?`,
  'gu'
);

/** Fees quoted alongside a payment, and limits quoted alongside a card. */
const ASIDE_CLAUSE = new RegExp(
  `(?:\\b(?:FEE|FEES|CHARGES?|COMMISSION|LIMIT|VAT|TAX)\\b|رسوم|عموله|ضريبه|مصاريف|الحد)` +
    `[^\\d]{0,15}(?:${CUR})?\\s*(?:${NUM})\\s*(?:${CUR})?`,
  'gu'
);

/** The balance clause again, this time keeping the figure. */
const BALANCE_VALUE = new RegExp(
  `(?:\\b(?:AVAIL(?:ABLE)?|CURRENT|NEW|REMAINING|LEDGER|CLOSING|RUNNING|TOTAL)?\\.?\\s*BAL(?:ANCE)?\\b|الرصيد|رصيد)` +
    `[^\\d]{0,25}?(?:(${CUR})\\s*)?(${NUM})(?:\\s*(${CUR}))?`,
  'gu'
);

/** Fees only: a limit or a tax rate quoted beside a payment is not money that moved. */
const FEE_VALUE = new RegExp(
  `(?:\\b(?:FEES?|CHARGES|COMMISSION)\\b|رسوم|عموله|مصاريف)[^\\d]{0,15}(?:(${CUR})\\s*)?(${NUM})`,
  'gu'
);

const ATM = /\bATM\b|CASH WITHDRAW|سحب نقدي|ماكينه|الصراف/;
const REFUND = /\bREFUND(?:ED)?\b|\bREVERS(?:AL|ED)\b|\bCHARGEBACK\b|استرداد|مسترد|عكس/;
const SALARY = /\bSALARY\b|\bPAYROLL\b|راتب|مرتب/;
const TRANSFER = /INSTA ?PAY|انستا ?باي|\bTRANSFER(?:RED)?\b|\bIPN\b|\bSENT\b|\bRECEIVED FROM\b|تحويل|حواله|ارسال|استلام|استقبال/;
const INSTRUMENT: [RegExp, NonNullable<ParsedSms['instrument']>][] = [
  [/CREDIT ?CARD|ائتمان/, 'credit'],
  [/WALLET|محفظه|VODAFONE CASH|ORANGE CASH|ETISALAT CASH|فودافون كاش|اورنج كاش/, 'wallet'],
  [/\bCARD\b|بطاقه|بطاقتك/, 'card'],
  [/ACCOUNT|\bA\/C\b|\bACCT\b|حساب/, 'account'],
];

// ---------------------------------------------------------------------------
// What is not a transaction

const NOT_A_TRANSACTION: [RegExp, SkipReason][] = [
  // One-time passwords are the dangerous case: they contain a number, they come
  // from the bank's own sender id, and importing one would put a six-digit
  // "purchase" in the ledger. They are rejected first and unconditionally.
  [/\bOTP\b|ONE[- ]TIME (?:PASSWORD|PIN|CODE)|VERIFICATION CODE|\bDO NOT SHARE\b|\bNEVER SHARE\b|SECRET CODE|ACTIVATION CODE/, 'otp'],
  [/رمز (?:التحقق|التفعيل|الدخول|سري|المرور)|كود (?:التحقق|التفعيل)|كلمه (?:المرور|السر)|الرقم السري|لا (?:تشارك|تفصح|تعطي)|لمره واحده/, 'otp'],
  // Marketing. "Win", "offer" and a percentage are never a payment. In Arabic
  // the word for "deduction" (خصم) is also the word for "discount", so a
  // percentage next to it is what marks the advert.
  [/\bUNSUBSCRIBE\b|\b(?:SPECIAL |EXCLUSIVE )?OFFER\b|\bDISCOUNT\b|\bCONGRATULATIONS\b|\bCASHBACK OFFER\b|\bAPPLY NOW\b|\bTERMS AND CONDITIONS\b/, 'promo'],
  [/خصم\s*\d+\s*%|\d+\s*%\s*(?:خصم|كاش|استرداد)|عرض خاص|عروض|اربح|هديه|استمتع|مسابقه|لفتره محدوده|احصل علي/, 'promo'],
  // A request for money is not money moving. Approving it produces its own
  // message, and importing both would double the payment.
  [/\b(?:PAYMENT |MONEY )?REQUEST (?:FROM|OF|HAS BEEN)|\bREQUESTED\b/, 'request'],
  [/طلب (?:تحويل|دفع|اموال|سداد)|يطلب منك/, 'request'],
  // A failure is not a transaction either.
  [/\b(?:DECLINED|REJECTED|FAILED|UNSUCCESSFUL|INSUFFICIENT)\b/, 'declined'],
  [/مرفوض|رفض|فشل|غير ناجح|لم تتم|تعذر|غير كاف/, 'declined'],
  // A statement or a reminder mentions amounts that have already been counted,
  // or will be later.
  [/\bDUE (?:ON|DATE|AMOUNT)\b|\bMINIMUM (?:DUE|PAYMENT)\b|\bSTATEMENT\b|\bWILL BE (?:DEBITED|CHARGED|DEDUCTED)\b/, 'not-yet'],
  [/سيتم (?:خصم|سحب|تحصيل)|مستحق|الاستحقاق|الحد الادني|كشف حساب/, 'not-yet'],
];

// ---------------------------------------------------------------------------
// Which way the money went

// Bare "DEBIT" and "CREDIT" are deliberately absent: "your credit card was
// debited" is a payment, and a reader that counted the word "credit" would call
// half of all card spending income.
const DEBIT_EN = [
  'DEBITED', 'PURCHASE', 'PURCHASED', 'POS', 'WITHDRAWN', 'WITHDRAWAL', 'PAID',
  'PAYMENT', 'SENT', 'DEDUCTED', 'CHARGED', 'SPENT', 'TRANSFERRED', 'TRANSFER',
  'ATM', 'BOUGHT',
];
const CREDIT_EN = [
  'CREDITED', 'RECEIVED', 'DEPOSIT', 'DEPOSITED', 'REFUND', 'REFUNDED', 'SALARY',
  'CASHBACK', 'REVERSED', 'REVERSAL', 'INCOMING',
];
// Arabic is matched as substrings: words carry attached prefixes ("بخصم",
// "والسحب", "للشراء") that a boundary would wrongly exclude. Each entry is chosen
// to be unambiguous as a substring — which is why "صرف" (spend) is absent: it is
// also inside "مصرف", the word for "bank".
const DEBIT_AR = ['خصم', 'سحب', 'شراء', 'مشتريات', 'دفع', 'سداد', 'تحويل', 'حواله', 'ارسال'];
const CREDIT_AR = [
  'ايداع', 'استلام', 'استلمت', 'استقبال', 'استقبلت', 'وارد', 'اضافه', 'استرداد', 'مسترد',
  'راتب', 'مرتب', 'دائن',
  // Longer than "تحويل" / "حواله" so they win when they start at the same place.
  'تحويل وارد', 'حواله وارده',
];

// Phrases that settle the direction outright, wherever they appear. "From your
// account" is a payment and "to your account" is a deposit, regardless of which
// verb the bank happened to lead with.
const STRONG_DEBIT = /FROM YOUR (?:ACCOUNT|CARD|WALLET)|DEBITED FROM|من (?:حسابك|حسابكم|بطاقتك|بطاقتكم|محفظتك|رصيدك)/;
const STRONG_CREDIT = /TO YOUR (?:ACCOUNT|CARD|WALLET)|CREDITED TO|اليك|(?:الى|الي) (?:حسابك|حسابكم|محفظتك)|لحسابك|لحسابكم|لمحفظتك/;

interface Hit {
  index: number;
  length: number;
}

/**
 * Where the first of these words appears.
 *
 * Position, not frequency, decides the direction: a bank leads with what
 * happened and mentions the rest afterwards. "Refunded ... for a purchase" is a
 * refund. When two words start at the same place the longer wins, which is how
 * "تحويل وارد" (incoming transfer) beats the "تحويل" inside it.
 */
function firstHit(text: string, en: string[], ar: string[]): Hit | null {
  let best: Hit | null = null;
  const consider = (index: number, length: number) => {
    if (index < 0) return;
    if (!best || index < best.index || (index === best.index && length > best.length)) best = { index, length };
  };
  for (const w of en) {
    const m = text.match(new RegExp(`\\b${w}\\b`));
    if (m && m.index !== undefined) consider(m.index, w.length);
  }
  for (const w of ar) consider(text.indexOf(w), w.length);
  return best;
}

function direction(text: string): boolean | null {
  const sd = STRONG_DEBIT.test(text);
  const sc = STRONG_CREDIT.test(text);
  if (sc && !sd) return true;
  if (sd && !sc) return false;
  const d = firstHit(text, DEBIT_EN, DEBIT_AR);
  const c = firstHit(text, CREDIT_EN, CREDIT_AR);
  if (!d && !c) return null;
  if (!d) return true;
  if (!c) return false;
  return c.index < d.index || (c.index === d.index && c.length > d.length);
}

// ---------------------------------------------------------------------------
// Identity

/**
 * A dedupe key that survives a reinstall.
 *
 * Not the provider's row id: those are reassigned when the message store is
 * rebuilt from a backup, which would re-import a year of payments. The content
 * and its arrival time identify a message uniquely and permanently.
 */
export function smsKey(m: Pick<SmsMessage, 'sender' | 'body' | 'ts'>): string {
  const s = `${m.sender.trim().toUpperCase()}|${m.ts}|${m.body.replace(/\s+/g, ' ').trim()}`;
  // FNV-1a, twice over with different offsets: one 32-bit hash over a corpus
  // this small collides sooner than is comfortable when a collision means a
  // payment silently vanishes as a "duplicate".
  const fnv = (seed: number) => {
    let h = seed;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return fnv(0x811c9dc5) + fnv(0x9e3779b9);
}

// ---------------------------------------------------------------------------
// Who was paid

/** Strip the bits people don't want to read: reference numbers, dates, noise. */
function tidyMerchant(raw: string): string {
  let s = raw
    .replace(/\s+/g, ' ')
    .replace(/[.,;:*_|\-،؛]+$/, '')
    .trim();
  // Merchant strings from card networks carry a city and country on the end,
  // padded out with spaces: "STARBUCKS ZAMALEK      CAI EG".
  s = s.replace(/\s+[A-Z]{2}$/, '');
  // Terminal and reference ids are noise to a human reader.
  s = s.replace(/\b(?:REF|REFERENCE|TRX|TXN|TID|MID|AUTH)[.:# ]*\w+\b/gi, '').trim();
  s = s.replace(/[.,;:*_|\-،؛]+$/, '').trim();
  if (!s) return '';
  // Card networks shout. Title case reads better beside hand-typed entries,
  // but an all-caps acronym like "IKEA" or "BP" should stay as it is. Arabic
  // has no case and is left exactly as written.
  return s
    .split(' ')
    .map((w) => (w.length <= 3 || !/^[A-Z0-9'&.-]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}

// Where a merchant name ends. Everything a bank appends after the name — the
// date, the card, the reference, the balance — starts with one of these, and
// without them the name swallows the rest of the sentence. "علي" is
// deliberately not here even though it means "on": it is also the name Ali.
const NAME_END =
  '(?:ON|USING|WITH|VIA|FOR|FROM|AND|REF|REFERENCE|YOUR|AVAIL|AVAILABLE|BAL|BALANCE|CARD|ACCOUNT|AT)\\b' +
  '|(?:بتاريخ|تاريخ|يوم|في|الرصيد|رصيد|رصيدك|رقم|مرجع|المرجع|عبر|بطاقه|بالبطاقه|بقيمه|بمبلغ|مبلغ|الساعه|بنجاح|من|الى|الي|لدي|باستخدام)(?![\\p{L}])';

const nameAfter = (marker: string) =>
  new RegExp(`${LB}${marker}\\s+(.{2,60}?)(?=\\s+(?:${NAME_END})|[.,;!،؛]|$)`, 'u');

const OUTGOING = ['AT', 'TO', 'FOR', 'لدي', 'عند', 'لصالح', 'الى', 'الي'].map(nameAfter);
const INCOMING = ['FROM', 'BY', 'من', 'بواسطه'].map(nameAfter);

/** Things that follow "to"/"from" but are not a party: an account, a number. */
const NOT_A_NAME = /^(?:YOUR|THE|A|AN)\b|^(?:حساب|رقم|بطاقه|رصيد|محفظه|الصراف|ماكينه|البطاقه)/u;

/**
 * The party named beside the amount, chosen to match the direction.
 *
 * Located in the normalised text — where the patterns can rely on one spelling
 * — then cut from the readable text at the same position, so the name is shown
 * the way the bank wrote it.
 */
function findMerchant(norm: string, disp: string, income: boolean): string {
  for (const re of income ? INCOMING : OUTGOING) {
    const m = re.exec(norm);
    if (!m || m.index === undefined) continue;
    const start = m.index + m[0].indexOf(m[1]);
    const candidateNorm = m[1];
    const t = tidyMerchant(disp.slice(start, start + candidateNorm.length));
    // "at 14:35" is a time and "to 01012345678" is a phone number. A name has
    // to read like one: some letters, and not a clock.
    if (!t || /^\d{1,2}[:.]\d{2}/.test(t)) continue;
    if (!/\p{L}{2}/u.test(t)) continue;
    if (NOT_A_NAME.test(candidateNorm)) continue;
    return t;
  }
  return '';
}

const CARD_TAIL = /(?:ENDING(?:\s+(?:IN|WITH))?|CARD(?:\s+(?:NO|NUMBER))?\.?|ACCOUNT|ACCT?\.?|A\/C)\s*[:#]?\s*[*x•#]{0,8}\s*(\d{4})\b/i;
const MASKED_TAIL = /[*x•#]{3,}\s*(\d{4})(?!\d)/i;
const OTHER_SIDE_TO = /\bTO\s+(?:(?:THE|BENEFICIARY)\s+)?(?:ACCOUNT|ACCT\.?|A\/C|CARD|WALLET|MOBILE|IBAN)\b[^.,;]{0,30}/gi;
const OTHER_SIDE_FROM = /\bFROM\s+(?:(?:THE|SENDER)\s+)?(?:ACCOUNT|ACCT\.?|A\/C|CARD|WALLET|MOBILE|IBAN)\b[^.,;]{0,30}/gi;
const CARD_TAIL_AR = /(?:بطاقه|بطاقتك|بطاقتكم|البطاقه|حساب|حسابك|حسابكم)[^\d*x•#]{0,20}?[*x•#]{0,8}\s*(\d{4})(?!\d)/u;

// ---------------------------------------------------------------------------

export type Analysis = { ok: true; parsed: ParsedSms } | { ok: false; reason: SkipReason };

/**
 * Read one message, and say why when it is not imported.
 *
 * The reason is what the on-device diagnostic shows. "Nothing was imported" is
 * unanswerable; "your bank's messages all say 'no amount found'" is a one-line
 * fix.
 */
export function analyseSms(m: SmsMessage, home = 'EGP'): Analysis {
  const disp = basicNormalize(m.body);
  if (!disp) return { ok: false, reason: 'empty' };
  const norm = forMatching(disp);

  for (const [re, reason] of NOT_A_TRANSACTION) if (re.test(norm)) return { ok: false, reason };

  // Cut out the amounts that belong to something other than this payment,
  // before looking for the payment's own.
  const scan = norm.replace(BALANCE_CLAUSE, ' ').replace(ASIDE_CLAUSE, ' ');

  const found: { currency: string; amount: number }[] = [];
  for (const hit of scan.matchAll(AMOUNT)) {
    const n = Number((hit[2] || hit[3]).replace(/,/g, ''));
    if (isFinite(n) && n > 0) found.push({ currency: normCurrency(hit[1] || hit[4]), amount: n });
  }
  if (!found.length) {
    const bare = scan.match(BARE_AMOUNT);
    const n = bare ? Number(bare[1].replace(/,/g, '')) : NaN;
    if (isFinite(n) && n > 0) found.push({ currency: home, amount: n });
  }
  if (!found.length) return { ok: false, reason: 'no-amount' };

  // A card used abroad produces "USD 30.00 (EGP 1,450.00)". Both are the same
  // payment, but only one of them can go in a ledger kept in pounds — putting
  // 30 where 1,450 belongs understates the month by the whole exchange rate.
  // So when the bank has already done the conversion, take its figure.
  const { currency, amount } = found.find((f) => f.currency === home) || found[0];

  // Direction is read from the full text: "من رصيدك" (from your balance) is a
  // decisive phrase that the balance strip above would otherwise mangle.
  const income = direction(norm);
  // No verb at all means this probably isn't a transaction message — a bank
  // always says what happened. Better to skip it than to invent a purchase.
  if (income === null) return { ok: false, reason: 'no-verb' };

  // "Sent to account ending 9876" names the other side's account, not the
  // user's: left in, it would file the payment under an account that isn't theirs.
  const own = disp.replace(income ? OTHER_SIDE_FROM : OTHER_SIDE_TO, ' ');
  const cardMatch = own.match(CARD_TAIL) || own.match(MASKED_TAIL) || norm.match(CARD_TAIL_AR);

  // The balance afterwards, in the payment's own currency only: an account
  // kept in dollars says nothing about one kept in pounds.
  let balance: number | null = null;
  for (const b of norm.matchAll(BALANCE_VALUE)) {
    const cur = b[1] || b[3] ? normCurrency(b[1] || b[3]) : currency;
    const n = Number(b[2].replace(/,/g, ''));
    if (cur === currency && isFinite(n)) balance = n;
  }
  let fee = 0;
  for (const f of norm.matchAll(FEE_VALUE)) {
    const cur = f[1] ? normCurrency(f[1]) : currency;
    const n = Number(f[2].replace(/,/g, ''));
    if (cur === currency && isFinite(n) && n < amount) fee += n;
  }
  const instrument = INSTRUMENT.find(([re]) => re.test(norm))?.[1] ?? null;

  return {
    ok: true,
    parsed: {
      key: smsKey(m),
      amount,
      currency,
      income,
      merchant: findMerchant(norm, disp, income) || tidyMerchant(m.sender) || 'Bank',
      card: cardMatch ? cardMatch[1] : null,
      ts: m.ts,
      body: disp,
      balance,
      fee: Math.round(fee * 100) / 100,
      atm: !income && ATM.test(norm),
      refund: income && REFUND.test(norm),
      salary: income && SALARY.test(norm),
      transfer: TRANSFER.test(norm),
      instrument,
    },
  };
}

/**
 * Read one message. Returns null when it is not a transaction, or when it is
 * one but the amount cannot be found — a transaction with a guessed amount is
 * worse than no transaction.
 *
 * `home` is the currency the user's ledger is kept in. It breaks ties between
 * two quoted currencies, and is the currency of a bare "amount of 250".
 */
export function parseSms(m: SmsMessage, home = 'EGP'): ParsedSms | null {
  const a = analyseSms(m, home);
  return a.ok ? a.parsed : null;
}

// ---------------------------------------------------------------------------
// Choosing a category
//
// Guessing is the second-best source. The best is the user: once they have
// moved one "Uber" to Transport, every later Uber belongs in Transport, and no
// keyword table will ever beat that. So history is consulted first and the
// table is only the answer for a merchant that has never been seen.

const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/CARREFOUR|SPINNEY|HYPER|METRO MARKET|SEOUDI|GOURMET|KAZYON|MARKET|GROCER|SUPERMARKET|BIM\b|كارفور|سبينيس|هايبر|ماركت|بقال|كازيون|خير زمان/u, 'Groceries'],
  [/UBER|CAREEM|SWVL|TAXI|LIMOUSINE|MWASALAT|METRO\b|RAILWAY|FLIGHT|EGYPTAIR|PETROL|FUEL|GAS STATION|CHILLOUT|MOBIL|TOTAL ENERG|WATANIA|PARKING|اوبر|أوبر|كريم|سويفل|تاكسي|بنزين|وقود|مترو/u, 'Transport'],
  [/PHARMAC|SEIF|ROSHDY|EL EZABY|HOSPITAL|CLINIC|LAB\b|MEDICAL|DENTAL|DOCTOR|صيدلي|مستشف|عياد|معمل/u, 'Health'],
  [/RESTAURANT|CAFE|COFFEE|STARBUCKS|COSTA|MCDONALD|KFC|PIZZA|BURGER|BUFFALO|CILANTRO|DUNKIN|TSEPPAS|BAKERY|JUICE|FOOD|TALABAT|ELMENUS|OTLOB|مطعم|كافيه|قهوه|قهوة|طلبات|مخبز/u, 'Food'],
  [/NETFLIX|SPOTIFY|YOUTUBE|APPLE\.COM|ITUNES|GOOGLE|PLAYSTATION|STEAM|SHAHID|OSN|ANGHAMI|SUBSCRIPTION|شاهد|نتفليكس/u, 'Entertainment'],
  [/VODAFONE|ORANGE|ETISALAT|WE\b|TE DATA|INTERNET|MOBILE RECHARGE|FAWRY|ELECTRIC|WATER BILL|GAS BILL|UTILITY|BILL PAYMENT|فودافون|اورنج|أورنج|اتصالات|فوري|كهرباء|فاتور/u, 'Bills'],
  [/AMAZON|NOON|JUMIA|ZARA|H&M|DEFACTO|MAX\b|CITY ?STARS|MALL|SHOP|STORE|IKEA|B ?TECH|2B\b|TRADELINE|امازون|نون|جوميا/u, 'Shopping'],
  [/GYM|FITNESS|GOLD'?S|SPORT|PADEL|CLUB|جيم|نادي/u, 'Fitness'],
  [/SALARY|PAYROLL|WAGE|راتب|مرتب/u, 'Salary'],
  [/ATM|CASH WITHDRAW|صراف/u, 'Cash'],
];

/**
 * Pick a category for an imported payment.
 *
 * `history` is the user's existing transactions, most recent first, and it wins
 * over everything: a merchant they have already filed once is filed the same
 * way again. That is what turns "fix it afterwards" into a system that stops
 * needing to be fixed.
 */
export function guessCategory(
  merchant: string,
  income: boolean,
  history: { name: string; cat: string; income: boolean }[],
  known: string[]
): string {
  const key = merchant.trim().toUpperCase();
  if (key) {
    const seen = history.find(
      (t) => t.income === income && t.name.trim().toUpperCase() === key && t.cat && t.cat !== 'Other'
    );
    if (seen) return seen.cat;
  }

  const fallback = income ? 'Income' : 'Other';
  for (const [re, cat] of KEYWORD_CATEGORIES) {
    if (!re.test(key)) continue;
    // Only offer a category the user actually has. Inventing one from a table
    // would scatter entries across categories that appear nowhere else in
    // their app.
    const match = known.find((k) => k.toLowerCase() === cat.toLowerCase());
    if (match) return match;
  }
  return known.find((k) => k.toLowerCase() === fallback.toLowerCase()) || fallback;
}

/** Read a batch, keeping only what parsed and dropping repeats within it. */
export function parseAll(messages: SmsMessage[], home = 'EGP'): ParsedSms[] {
  const out: ParsedSms[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    const p = parseSms(m, home);
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out;
}
