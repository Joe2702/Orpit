// Formatting helpers ported 1:1 from the Orbit prototype.

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

export function hm(h: number): string {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
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
export function moneySymbol(): string {
  return CURRENCIES.find((c) => c.code === CURRENT_CURRENCY)?.symbol || '$';
}

export function money(n: number): string {
  const a = Math.abs(n);
  return (
    moneySymbol() +
    a.toLocaleString('en-US', {
      minimumFractionDigits: a % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Whole units, for averages and totals where piastres are noise: "E£351". */
export function money0(n: number): string {
  return moneySymbol() + Math.round(Math.abs(n)).toLocaleString('en-US');
}

/** Axis-sized money: "E£950", "E£12.4k", "E£1.2M". */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
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
  if (m < 60) return `${m} min`;
  if (m >= 600) return `${Math.round(m / 60).toLocaleString('en-US')} h`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
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
  if (di <= 0) return 'Today';
  if (di === 1) return 'Yesterday';
  if (di < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = new Date(ts).getFullYear() === st.getFullYear();
  return new Date(ts).toLocaleDateString('en-US', sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function todayStr(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Human-readable schedule from a 7-char day mask (Sun..Sat).
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Ranges are spelled out ("Sun – Thu") rather than called "weekdays": whose
// weekdays depends on where you live, and here the work week is Sunday to
// Thursday.
export function daysLabel(days: string): string {
  if (!/^[01]{7}$/.test(days) || days === '1111111') return 'Every day';
  const sel: number[] = [];
  for (let i = 0; i < 7; i++) if (days[i] === '1') sel.push(i);
  if (sel.length === 0) return 'No days';
  if (sel.length === 1) return `${DAY_ABBR[sel[0]]}s`;
  if (sel.length === 2) return `${DAY_ABBR[sel[0]]} & ${DAY_ABBR[sel[1]]}`;
  const contiguous = sel.every((d, i) => i === 0 || d === sel[i - 1] + 1);
  if (contiguous) return `${DAY_ABBR[sel[0]]} – ${DAY_ABBR[sel[sel.length - 1]]}`;
  return sel.map((d) => DAY_ABBR[d]).join(', ');
}

export const cssVar = (key: string) => `var(--${key})`;

// Counter number: one decimal only when needed.
export function cNum(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1
    ? r.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Math.round(n).toLocaleString('en-US');
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
export function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
