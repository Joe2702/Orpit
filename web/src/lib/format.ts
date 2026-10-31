// Formatting helpers ported 1:1 from the Orbit prototype. Everything a person
// reads goes through ../i18n, so dates, digits and units follow the language.
import { date, getLang, num, t, tn } from '../i18n';

/**
 * The calendar day (YYYY-MM-DD) a timestamp falls on **in the user's own
 * timezone**. Habit check-ins are keyed by this — using UTC instead would file
 * anything logged after midnight (east of UTC) under the previous day.
 */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

const pad2 = (n: number) => num(n, { minimumIntegerDigits: 2 });

export function hm(h: number): string {
  const m = Math.round(h * 60);
  return t('{h}h {m}m', { h: Math.floor(m / 60), m: pad2(m % 60) });
}

export interface CurrencyOpt {
  code: string;
  label: string;
  symbol: string;
}
export const CURRENCIES: CurrencyOpt[] = [
  { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'SAR', label: 'Saudi Riyal', symbol: 'SR ' },
];

let CURRENT_CURRENCY = 'EGP';
export function setCurrency(code: string | undefined) {
  CURRENT_CURRENCY = CURRENCIES.some((c) => c.code === code) ? (code as string) : 'EGP';
}
/** In Arabic the pound is written ج.م and, like every symbol, follows the figure. */
const AR_SYMBOL: Record<string, string> = { EGP: 'ج.م', SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£' };
export function moneySymbol(): string {
  if (getLang() === 'ar') return AR_SYMBOL[CURRENT_CURRENCY] || CURRENT_CURRENCY;
  return CURRENCIES.find((c) => c.code === CURRENT_CURRENCY)?.symbol || '$';
}
/** Puts the symbol where the reader expects it: "E£1,250" or "1,250 ج.م". */
const withSymbol = (figure: string) => (getLang() === 'ar' ? `${figure}\u00a0${moneySymbol()}` : moneySymbol() + figure);

export function money(n: number): string {
  const a = Math.abs(n);
  return withSymbol(num(a, { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 }));
}

/** Whole units, for averages and totals where piastres are noise: "E£351". */
export function money0(n: number): string {
  return withSymbol(num(Math.round(Math.abs(n))));
}

/** Axis-sized money: "E£950", "E£12.4k", "E£1.2M". */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (getLang() === 'ar') {
    // "١٢ ألف", "١٫٢ مليون": Arabic has words for these, not letters.
    return withSymbol(a >= 1e3 ? num(a, { notation: 'compact', maximumFractionDigits: a >= 1e4 && a < 1e6 ? 0 : 1 }) : num(Math.round(a)));
  }
  const sym = moneySymbol();
  if (a >= 1e6) return `${sym}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${sym}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${sym}${Math.round(a)}`;
}

// The sign is glued to the figure with no space, so a narrow card can never
// wrap it onto a line of its own ("–" above "E£2,460").
export function signMoney(n: number): string {
  return (n >= 0 ? '+' : '−') + money(n);
}

/** Training time the way people say it: "45 min", "1h 20m", "175 h". */
export function minutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return t('{n} min', { n: m });
  if (m >= 600) return t('{n} h', { n: Math.round(m / 60) });
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? t('{h}h {m}m', { h, m: pad2(r) }) : t('{h}h', { h });
}

export function fmtClock(h: number | null): string {
  if (h == null) return '—';
  let x = ((h % 24) + 24) % 24;
  let hh = Math.floor(x);
  let mm = Math.round((x - hh) * 60);
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  if (getLang() === 'ar') return date(new Date(2000, 0, 1, hh, mm), { hour: 'numeric', minute: '2-digit' });
  const ap = hh < 12 ? 'AM' : 'PM';
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  // A no-break space keeps "PM" from wrapping onto a line of its own.
  return h12 + ':' + String(mm).padStart(2, '0') + '\u00a0' + ap;
}

export function parseClock(str: string): number {
  const p = String(str || '').split(':');
  return (parseInt(p[0]) || 0) + (parseInt(p[1]) || 0) / 60;
}

export function relLabel(ts: number): string {
  const st = new Date();
  st.setHours(0, 0, 0, 0);
  // Rounded, because the day the clocks change is 23 or 25 hours long.
  const di = Math.round((st.getTime() - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (di <= 0) return t('Today');
  if (di === 1) return t('Yesterday');
  if (di < 7) return date(ts, { weekday: 'long' });
  const sameYear = new Date(ts).getFullYear() === st.getFullYear();
  return date(ts, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

export function todayStr(): string {
  return date(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Sun".."Sat" for a day index, in the reader's language. Jan 4 2026 was a Sunday. */
export const dayAbbr = (d: number) => date(new Date(2026, 0, 4 + d), { weekday: 'short' });
/** "Sunday".."Saturday". */
export const dayLong = (d: number) => date(new Date(2026, 0, 4 + d), { weekday: 'long' });
/** ", " or "، ". */
export const listSep = () => (getLang() === 'ar' ? '، ' : ', ');

// Human-readable schedule from a 7-char day mask (Sun..Sat).
// Ranges are spelled out ("Sun – Thu") rather than called "weekdays": whose
// weekdays depends on where you live, and here the work week is Sunday to
// Thursday.
export function daysLabel(days: string): string {
  if (!/^[01]{7}$/.test(days) || days === '1111111') return t('Every day');
  const sel: number[] = [];
  for (let i = 0; i < 7; i++) if (days[i] === '1') sel.push(i);
  if (sel.length === 0) return t('No days');
  if (sel.length === 1) return t('{day}s', { day: dayAbbr(sel[0]) });
  if (sel.length === 2) return t('{a} & {b}', { a: dayAbbr(sel[0]), b: dayAbbr(sel[1]) });
  const contiguous = sel.every((d, i) => i === 0 || d === sel[i - 1] + 1);
  if (contiguous) return `${dayAbbr(sel[0])} – ${dayAbbr(sel[sel.length - 1])}`;
  return sel.map((d) => dayAbbr(d)).join(listSep());
}

export const cssVar = (key: string) => `var(--${key})`;

// Counter number: one decimal only when needed.
export function cNum(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 ? num(r, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : num(Math.round(n));
}

export function fmtDate(ts: number): string {
  return date(ts, { month: 'short', day: 'numeric' });
}

export interface CounterTotals {
  all: number;
  year: number;
  month: number;
  logs: number;
  lastTs: number;
}

export function counterTotals(countLogs: { counterId: string; amount: number; ts: number }[], cid: string): CounterTotals {
  const now = new Date();
  const y0 = new Date(now.getFullYear(), 0, 1).getTime();
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let all = 0,
    year = 0,
    month = 0,
    logs = 0,
    lastTs = 0;
  countLogs.forEach((l) => {
    if (l.counterId !== cid) return;
    all += l.amount;
    logs++;
    if (l.ts > lastTs) lastTs = l.ts;
    if (l.ts >= y0) year += l.amount;
    if (l.ts >= m0) month += l.amount;
  });
  return { all, year, month, logs, lastTs };
}

/** "just now", "4 min ago", "3 h ago", "2 d ago". */
export function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.round(s / 3600) });
  return tn(Math.round(s / 86400), '{n} d ago', '{n} d ago');
}
