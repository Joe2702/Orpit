// Every currency in circulation, for the home currency.
//
// The list of codes is fixed here, so it doesn't depend on what the phone's
// browser knows. Names and symbols come from the phone (Intl), in English or
// Arabic, with the code itself as the fallback; the five Orbit always had keep
// the symbols people already know from it.

export const CODES = (
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC ' +
  'CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ' +
  'ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK ' +
  'MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE ' +
  'SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ' +
  'ZAR ZMW ZWG'
).split(' ');

/** Shown first: home, the big four, and the Gulf, where many people here earn. */
export const POPULAR = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR'];

const SET = new Set(CODES);
export const isCurrency = (c: unknown): c is string => typeof c === 'string' && SET.has(c);

// The symbols Orbit has always used for these.
const EN_SYMBOL: Record<string, string> = { EGP: 'E£', USD: '$', EUR: '€', GBP: '£', SAR: 'SR ' };
// In Arabic the pound is ج.م and the riyal ر.س, written after the figure.
const AR_SYMBOL: Record<string, string> = { EGP: 'ج.م', SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£' };

const cache = new Map<string, string>();
const memo = (k: string, f: () => string) => {
  let v = cache.get(k);
  if (v === undefined) {
    try {
      v = f();
    } catch {
      v = '';
    }
    cache.set(k, v);
  }
  return v;
};
// Direction marks the browser puts around Arabic symbols, which only get in
// the way when the symbol is placed by hand.
const clean = (s: string) => s.replace(/[‎‏؜ ]/g, '').replace(/\.$/, '').trim();

function intlSymbol(code: string, locale: string): string {
  return memo(`s:${locale}:${code}`, () =>
    clean(new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'symbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value || '')
  );
}

/** "E£", "CA$", "₹", or the code and a space ("AED ") when there's no sign. */
export function currencySymbol(code: string, lang: 'en' | 'ar' = 'en'): string {
  if (lang === 'ar') {
    if (AR_SYMBOL[code]) return AR_SYMBOL[code];
    return intlSymbol(code, 'ar') || code;
  }
  if (EN_SYMBOL[code]) return EN_SYMBOL[code];
  const s = intlSymbol(code, 'en-US');
  // A bare code reads better with a space before the figure: "AED 1,250".
  return !s || /^[A-Z]{3}$/.test(s) ? `${code} ` : s;
}

/** "Egyptian Pound" or "جنيه مصري"; the code if the phone doesn't know it. */
export function currencyName(code: string, lang: 'en' | 'ar' = 'en'): string {
  return (
    memo(`n:${lang}:${code}`, () => {
      const n = new Intl.DisplayNames([lang], { type: 'currency' }).of(code) || '';
      return n === code ? '' : n;
    }) || code
  );
}

/**
 * The flag of the country a currency belongs to, from its first two letters
 * (EG for EGP, EU for EUR). The shared West and Central African, Caribbean
 * and Pacific francs and dollars get a globe instead.
 */
export function currencyFlag(code: string): string {
  if (code === 'XAF' || code === 'XOF') return '🌍';
  if (code === 'XCD') return '🌎';
  if (code === 'XPF') return '🌏';
  return String.fromCodePoint(...[...code.slice(0, 2)].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

/** Currencies matching what's typed, by code, English or Arabic name, or symbol. */
export function searchCurrencies(q: string): string[] {
  const f = fold(q.trim());
  if (!f) return CODES;
  const starts: string[] = [];
  const has: string[] = [];
  for (const c of CODES) {
    const hay = [c, currencyName(c, 'en'), currencyName(c, 'ar'), currencySymbol(c, 'en').trim()].map(fold);
    if (hay.some((h) => h.startsWith(f) || h.split(/\s+/).some((w) => w.startsWith(f)))) starts.push(c);
    else if (hay.some((h) => h.includes(f))) has.push(c);
  }
  return [...starts, ...has];
}
