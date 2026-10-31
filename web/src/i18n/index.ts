// Orbit speaks English and Arabic.
//
// English is written inline where it's used and is its own key: t('Save').
// Arabic lives in ./ar.ts and is fetched only when Arabic is chosen, so an
// English user never downloads it. A missing translation shows the English,
// never a blank or a key.
//
// The language is a setting of this phone, like the app lock: someone may want
// Arabic on their own phone and English on a shared tablet. Changing it reloads
// the app once, which is simpler and safer than re-rendering every cached label
// and date in place.

export type Lang = 'en' | 'ar';
export type LangPref = 'auto' | Lang;
/** Western 0-9 or Arabic-Indic ٠-٩. Bank messages here use Western digits. */
export type Digits = 'latn' | 'arab';
/** Arabic has six plural forms; English needs `one` and `other`. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
export type Dict = Record<string, string | Plural>;
export type Vars = Record<string, string | number>;

const LANG_KEY = 'orbit_lang';
const DIGITS_KEY = 'orbit_digits';

let lang: Lang = 'en';
let digits: Digits = 'latn';
let dict: Dict | null = null;
let dataDict: Record<string, string> | null = null;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string | null): void {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* without storage the choice lasts until the app closes */
  }
}

export function langPref(): LangPref {
  const v = read(LANG_KEY);
  return v === 'en' || v === 'ar' ? v : 'auto';
}
export function digitsPref(): Digits {
  return read(DIGITS_KEY) === 'arab' ? 'arab' : 'latn';
}

/** The phone's own language decides "auto". */
export function phoneLang(): Lang {
  const first = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '';
  return /^ar\b/i.test(first) ? 'ar' : 'en';
}

/** Run once before the app renders. */
export async function initI18n(): Promise<void> {
  const p = langPref();
  lang = p === 'auto' ? phoneLang() : p;
  digits = digitsPref();
  if (lang === 'ar') {
    try {
      const m = await import('./ar');
      dict = m.AR;
      dataDict = m.AR_DATA;
    } catch {
      // The chunk didn't load (an interrupted update): English beats a broken screen.
      lang = 'en';
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  }
}

export const getLang = (): Lang => lang;
export const isRTL = (): boolean => lang === 'ar';
export const getDigits = (): Digits => digits;

export function setLangPref(p: LangPref): void {
  write(LANG_KEY, p === 'auto' ? null : p);
  if (typeof window !== 'undefined') window.location.reload();
}
export function setDigits(d: Digits): void {
  write(DIGITS_KEY, d === 'latn' ? null : d);
  if (typeof window !== 'undefined') window.location.reload();
}

/** BCP 47 locale for Intl: dates, numbers and plural rules all follow it. */
export function locale(): string {
  return lang === 'ar' ? `ar-EG-u-nu-${digits}` : 'en-US';
}

const numFmts = new Map<string, Intl.NumberFormat>();
/** A number in the reader's digits and separators: 1,250 or ١٬٢٥٠. */
export function num(n: number, opts?: Intl.NumberFormatOptions): string {
  const k = locale() + JSON.stringify(opts || {});
  let f = numFmts.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale(), opts);
    numFmts.set(k, f);
  }
  return f.format(n);
}

/** A year has no thousands separator: 2026, not 2,026. */
export const yearStr = (y: number): string => num(y, { useGrouping: false });

const dateFmts = new Map<string, Intl.DateTimeFormat>();
/** A date in the reader's language: "Oct 28" or "٢٨ أكتوبر". */
export function date(ts: number | Date, opts: Intl.DateTimeFormatOptions): string {
  const k = locale() + JSON.stringify(opts);
  let f = dateFmts.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), opts);
    dateFmts.set(k, f);
  }
  return f.format(ts);
}

/** "a, b and c" or "أ وب وج". */
export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (lang === 'ar') return new Intl.ListFormat('ar', { type: 'conjunction' }).format(parts);
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "18–24 أكتوبر": the reader's own way of writing a span of dates. */
export function dateRange(a: number, b: number, opts: Intl.DateTimeFormatOptions): string {
  const f = new Intl.DateTimeFormat(locale(), opts);
  return f.formatRange ? f.formatRange(a, b) : `${f.format(a)} – ${f.format(b)}`;
}

function fill(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    return typeof v === 'number' ? num(v) : v;
  });
}

/**
 * Marks English that is defined in one place and translated where it's shown
 * (a label table, a message saved for later). Returns it unchanged; the
 * dictionary test reads these so they're never left untranslated.
 */
export const tk = (s: string): string => s;

/** Translate a piece of English. `{name}` placeholders are filled from `vars`. */
export function t(s: string, vars?: Vars): string {
  const tr = dict?.[s];
  return fill(typeof tr === 'string' ? tr : typeof tr === 'object' ? tr.other : s, vars);
}

let rules: Intl.PluralRules | null = null;
/**
 * A counted phrase. English picks `one` or `other`; Arabic looks up `other` and
 * picks among its six forms. `{n}` is the count, in the reader's digits.
 */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  const all = { n, ...vars };
  const tr = dict?.[other];
  if (lang === 'en' || !tr) return fill(n === 1 ? one : other, all);
  if (typeof tr === 'string') return fill(tr, all);
  if (!rules) rules = new Intl.PluralRules('ar');
  const form = rules.select(n) as keyof Plural;
  return fill(tr[form] ?? tr.other, all);
}

/**
 * A name that is stored data but came from Orbit, not the person: starter
 * categories, habits and workout types ("Food", "Drink water", "Push"). They
 * stay English underneath, because the bank-message reader files payments by
 * those names; only what's shown changes. Names people typed come back as typed.
 */
export function tData(name: string): string {
  return dataDict?.[name] ?? name;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/**
 * With Arabic digits chosen, every 0-9 that reaches the screen becomes ٠-٩:
 * counts, percentages, times and dates alike, however they were written. Text
 * fields keep what was typed, and anything marked data-digits="keep" (the digits
 * picker itself) is left alone. So is text with Latin letters in it ("Read 20
 * pages", a shop name): Arabic digits inside English break its word order.
 */
export function installDigitShaper(root: HTMLElement): void {
  if (lang !== 'ar' || digits !== 'arab' || typeof MutationObserver === 'undefined') return;
  const shape = (n: Node) => {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      if (v && /[0-9]/.test(v) && !/[A-Za-z]/.test(v) && !n.parentElement?.closest('input, textarea, script, style, [data-digits="keep"]')) {
        n.nodeValue = v.replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
      }
    } else n.childNodes.forEach(shape);
  };
  shape(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') shape(m.target);
      else m.addedNodes.forEach(shape);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
}

/** For tests: use a language without loading the real dictionary. */
export function __setLangForTest(l: Lang, d: Dict | null = null, data: Record<string, string> | null = null, dg: Digits = 'latn'): void {
  lang = l;
  dict = d;
  dataDict = data;
  digits = dg;
  numFmts.clear();
  dateFmts.clear();
  rules = null;
}
