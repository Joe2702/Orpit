// Reading a bank's SMS and turning it into a transaction.
//
// Banks do not publish these formats and change them without telling anyone, so
// nothing here is a per-bank template — those rot. It is one generic reader:
// find the money, work out which way it went, and take whoever is named beside
// it. That degrades gracefully. A format we have never seen still produces the
// amount and the direction, which are the two things that matter; only the
// merchant name suffers, and the user can fix a name in two taps.
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
}

const CURRENCIES = [
  'EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'BHD', 'JOD', 'TRY',
];

// Egyptian messages write pounds as "L.E." or "LE" about as often as "EGP".
const CUR_ALT = `${CURRENCIES.join('|')}|L\\.E\\.?|LE`;

const normCurrency = (c: string): string => {
  const u = c.toUpperCase().replace(/\./g, '');
  return u === 'LE' ? 'EGP' : u;
};

const NUM = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?';

/**
 * Messages that are not transactions.
 *
 * One-time passwords are the dangerous case: they contain a number, they come
 * from the bank's own sender id, and importing one would put a six-digit
 * "purchase" in the ledger. They are rejected first and unconditionally.
 */
const NOT_A_TRANSACTION = [
  /\bOTP\b/,
  /ONE[- ]TIME (?:PASSWORD|PIN|CODE)/,
  /VERIFICATION CODE/,
  /\bDO NOT SHARE\b/,
  /\bNEVER SHARE\b/,
  /SECRET CODE/,
  /ACTIVATION CODE/,
  // Marketing. "Win", "offer" and a phone number to call are never a payment.
  /\bUNSUBSCRIBE\b/,
  /\b(?:SPECIAL |EXCLUSIVE )?OFFER\b/,
  /\bDISCOUNT\b/,
  /\bCONGRATULATIONS\b/,
  /\bCASHBACK OFFER\b/,
  /\bAPPLY NOW\b/,
  /\bTERMS AND CONDITIONS\b/,
  // A request for money is not money moving. Approving it produces its own
  // message, and importing both would double the payment.
  /\b(?:PAYMENT |MONEY )?REQUEST (?:FROM|OF|HAS BEEN)/,
  /\bREQUESTED\b/,
  // A failure is not a transaction either.
  /\b(?:DECLINED|REJECTED|FAILED|UNSUCCESSFUL|INSUFFICIENT)\b/,
  // A statement or a reminder mentions amounts that have already been counted.
  /\bDUE (?:ON|DATE|AMOUNT)\b/,
  /\bMINIMUM (?:DUE|PAYMENT)\b/,
  /\bSTATEMENT\b/,
  /\bWILL BE (?:DEBITED|CHARGED|DEDUCTED)\b/,
];

/**
 * Amounts that are not the transaction's amount.
 *
 * Nearly every bank message ends by telling you what is left in the account,
 * and that number is larger than the payment and sits in the same sentence.
 * Reading it as the payment is the single worst thing this file could do, so
 * those clauses are cut out of the text before any amount is looked for.
 */
const BALANCE_CLAUSE = new RegExp(
  `\\b(?:AVAIL(?:ABLE)?|CURRENT|NEW|REMAINING|LEDGER|CLOSING|RUNNING|TOTAL)?\\.?\\s*` +
    `BAL(?:ANCE)?\\b[^\\d]{0,20}(?:${CUR_ALT})?\\s*(?:${NUM})\\s*(?:${CUR_ALT})?`,
  'gi'
);

/** Fees quoted alongside a payment, and limits quoted alongside a card. */
const ASIDE_CLAUSE = new RegExp(
  `\\b(?:FEE|FEES|CHARGES?|COMMISSION|LIMIT|VAT|TAX)\\b[^\\d]{0,15}(?:${CUR_ALT})?\\s*(?:${NUM})\\s*(?:${CUR_ALT})?`,
  'gi'
);

// Bare "DEBIT" and "CREDIT" are deliberately absent: "your credit card was
// debited" is a payment, and a reader that counted the word "credit" would call
// half of all card spending income.
const DEBIT_WORDS = [
  'DEBITED', 'PURCHASE', 'PURCHASED', 'POS', 'WITHDRAWN', 'WITHDRAWAL', 'PAID',
  'PAYMENT', 'SENT', 'DEDUCTED', 'CHARGED', 'SPENT', 'TRANSFERRED', 'TRANSFER',
  'ATM', 'BOUGHT',
];

const CREDIT_WORDS = [
  'CREDITED', 'RECEIVED', 'DEPOSIT', 'DEPOSITED', 'REFUND', 'REFUNDED', 'SALARY',
  'CASHBACK', 'REVERSED', 'REVERSAL', 'INCOMING', 'TO YOUR ACCOUNT',
];

/**
 * Where the first of these words appears, or -1.
 *
 * Position, not frequency, decides the direction: a bank leads with what
 * happened and mentions the rest afterwards. "Refunded ... for a purchase" is a
 * refund; "a purchase ... was refunded" would be too, but counting words scores
 * that pair 1–1 and has to fall back on a guess, while reading the first verb
 * gets both right.
 */
function firstWordAt(text: string, words: string[]): number {
  let best = -1;
  for (const w of words) {
    const m = text.match(new RegExp(`\\b${w}\\b`));
    if (m && m.index !== undefined && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

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

/** Strip the bits people don't want to read: reference numbers, dates, noise. */
function tidyMerchant(raw: string): string {
  let s = raw
    .replace(/\s+/g, ' ')
    .replace(/[.,;:*_|-]+$/, '')
    .trim();
  // Merchant strings from card networks carry a city and country on the end,
  // padded out with spaces: "STARBUCKS ZAMALEK      CAI EG".
  s = s.replace(/\s+[A-Z]{2}$/, '');
  // Terminal and reference ids are noise to a human reader.
  s = s.replace(/\b(?:REF|REFERENCE|TRX|TXN|TID|MID|AUTH)[.:# ]*\w+\b/gi, '').trim();
  s = s.replace(/[.,;:*_|-]+$/, '').trim();
  if (!s) return '';
  // Card networks shout. Title case reads better beside hand-typed entries,
  // but an all-caps acronym like "IKEA" or "BP" should stay as it is.
  return s
    .split(' ')
    .map((w) => (w.length <= 3 || !/^[A-Z0-9'&.-]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}

// Where a merchant name ends. Everything a bank appends after the name — the
// date, the card, the reference, the balance — starts with one of these, and
// without them the name swallows the rest of the sentence.
const NAME_END = '(?:ON|USING|WITH|VIA|FOR|FROM|AND|REF|REFERENCE|YOUR|AVAIL|AVAILABLE|BAL|BALANCE|CARD|ACCOUNT|AT)\\b';
const nameAfter = (word: string) => new RegExp(`\\b${word}\\s+(.{2,60}?)(?=\\s+${NAME_END}|[.,;!]|$)`, 'i');

/** The party named beside the amount, chosen to match the direction. */
function findMerchant(text: string, income: boolean): string {
  // Ordered by how strongly each word implies "the other party". `at` is the
  // card networks' word for a shop and is the most reliable of them.
  const outgoing = [nameAfter('AT'), nameAfter('TO'), nameAfter('FOR')];
  const incoming = [nameAfter('FROM'), nameAfter('BY')];

  for (const re of income ? incoming : outgoing) {
    const m = text.match(re);
    if (!m) continue;
    const t = tidyMerchant(m[1]);
    // "at 14:35" is a time and "to 01012345678" is a phone number. A name has
    // to read like one: some letters, and not a clock.
    if (!t || /^\d{1,2}[:.]\d{2}/.test(t)) continue;
    if (!/[A-Za-z]{2}/.test(t)) continue;
    if (/^(?:YOUR|THE|A|AN)\b/i.test(t)) continue;
    return t;
  }
  return '';
}

const CARD_TAIL = /(?:ENDING(?:\s+(?:IN|WITH))?|CARD(?:\s+(?:NO|NUMBER))?\.?|ACCOUNT|ACCT?\.?|A\/C)\s*[:#]?\s*[*x•#]{0,8}\s*(\d{4})\b/i;
const MASKED_TAIL = /[*x•#]{3,}\s*(\d{4})\b/i;

/**
 * Read one message. Returns null when it is not a transaction, or when it is
 * one but the amount cannot be found — a transaction with a guessed amount is
 * worse than no transaction.
 *
 * `home` is the currency the user's ledger is kept in. It only breaks ties: a
 * message quoting two currencies is one payment, and the home figure is the one
 * that belongs in the totals.
 */
export function parseSms(m: SmsMessage, home = 'EGP'): ParsedSms | null {
  const raw = m.body.replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  for (const re of NOT_A_TRANSACTION) if (re.test(upper)) return null;

  // Cut out the amounts that belong to something other than this payment,
  // before looking for the payment's own.
  const scan = upper.replace(BALANCE_CLAUSE, ' ').replace(ASIDE_CLAUSE, ' ');

  const AMOUNT = new RegExp(`(?:\\b(${CUR_ALT})\\s*(${NUM})\\b|\\b(${NUM})\\s*(${CUR_ALT})\\b)`, 'g');
  const found: { currency: string; amount: number }[] = [];
  for (const hit of scan.matchAll(AMOUNT)) {
    const n = Number((hit[2] || hit[3]).replace(/,/g, ''));
    if (isFinite(n) && n > 0) found.push({ currency: normCurrency(hit[1] || hit[4]), amount: n });
  }
  if (!found.length) return null;

  // A card used abroad produces "USD 30.00 (EGP 1,450.00)". Both are the same
  // payment, but only one of them can go in a ledger kept in pounds — putting
  // 30 where 1,450 belongs understates the month by the whole exchange rate.
  // So when the bank has already done the conversion, take its figure.
  const { currency, amount } = found.find((f) => f.currency === home) || found[0];

  const debit = firstWordAt(scan, DEBIT_WORDS);
  const credit = firstWordAt(scan, CREDIT_WORDS);
  // No verb at all means this probably isn't a transaction message — a bank
  // always says what happened. Better to skip it than to invent a purchase.
  if (debit === -1 && credit === -1) return null;
  // Whichever was said first. A message with only one of the two is decided by
  // that one; spending wins an exact tie, being much the commoner case.
  const income = credit !== -1 && (debit === -1 || credit < debit);

  const cardMatch = raw.match(CARD_TAIL) || raw.match(MASKED_TAIL);

  return {
    key: smsKey(m),
    amount,
    currency,
    income,
    merchant: findMerchant(raw, income) || tidyMerchant(m.sender) || 'Bank',
    card: cardMatch ? cardMatch[1] : null,
    ts: m.ts,
    body: raw,
  };
}

// ---------------------------------------------------------------------------
// Choosing a category
//
// Guessing is the second-best source. The best is the user: once they have
// moved one "Uber" to Transport, every later Uber belongs in Transport, and no
// keyword table will ever beat that. So history is consulted first and the
// table is only the answer for a merchant that has never been seen.

const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/CARREFOUR|SPINNEY|HYPER|METRO MARKET|SEOUDI|GOURMET|KAZYON|MARKET|GROCER|SUPERMARKET|BIM\b/, 'Groceries'],
  [/UBER|CAREEM|SWVL|TAXI|LIMOUSINE|MWASALAT|METRO\b|RAILWAY|FLIGHT|EGYPTAIR|PETROL|FUEL|GAS STATION|CHILLOUT|MOBIL|TOTAL ENERG|WATANIA|PARKING/, 'Transport'],
  [/PHARMAC|SEIF|ROSHDY|EL EZABY|HOSPITAL|CLINIC|LAB\b|MEDICAL|DENTAL|DOCTOR/, 'Health'],
  [/RESTAURANT|CAFE|COFFEE|STARBUCKS|COSTA|MCDONALD|KFC|PIZZA|BURGER|BUFFALO|CILANTRO|DUNKIN|TSEPPAS|BAKERY|JUICE|FOOD|TALABAT|ELMENUS|OTLOB/, 'Food'],
  [/NETFLIX|SPOTIFY|YOUTUBE|APPLE\.COM|ITUNES|GOOGLE|PLAYSTATION|STEAM|SHAHID|OSN|ANGHAMI|SUBSCRIPTION/, 'Entertainment'],
  [/VODAFONE|ORANGE|ETISALAT|WE\b|TE DATA|INTERNET|MOBILE RECHARGE|FAWRY|ELECTRIC|WATER BILL|GAS BILL|UTILITY|BILL PAYMENT/, 'Bills'],
  [/AMAZON|NOON|JUMIA|ZARA|H&M|DEFACTO|MAX\b|CITY ?STARS|MALL|SHOP|STORE|IKEA|B ?TECH|2B\b|TRADELINE/, 'Shopping'],
  [/GYM|FITNESS|GOLD'?S|SPORT|PADEL|CLUB/, 'Fitness'],
  [/SALARY|PAYROLL|WAGE/, 'Salary'],
  [/ATM|CASH WITHDRAW/, 'Cash'],
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
  const hay = key;
  for (const [re, cat] of KEYWORD_CATEGORIES) {
    if (!re.test(hay)) continue;
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
