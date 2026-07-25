// Formatting helpers ported 1:1 from the Orbit prototype.

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

export function signMoney(n: number): string {
  return (n >= 0 ? '+ ' : '− ') + money(n);
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
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap;
}

export function parseClock(str: string): number {
  const p = String(str || '').split(':');
  return (parseInt(p[0]) || 0) + (parseInt(p[1]) || 0) / 60;
}

export function relLabel(ts: number): string {
  const D = 86400000;
  const st = new Date();
  st.setHours(0, 0, 0, 0);
  const di = Math.floor((st.getTime() - new Date(ts).setHours(0, 0, 0, 0)) / D);
  if (di <= 0) return 'Today';
  if (di === 1) return 'Yesterday';
  if (di < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
export function daysLabel(days: string): string {
  if (!/^[01]{7}$/.test(days) || days === '1111111') return 'Every day';
  if (days === '0111110') return 'Weekdays';
  if (days === '1000001') return 'Weekends';
  const sel: string[] = [];
  for (let i = 0; i < 7; i++) if (days[i] === '1') sel.push(DAY_ABBR[i]);
  return sel.join(', ');
}

// Which week of the year we're in (1–53), counting from Jan 1.
export function weekOfYear(d = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return Math.min(52, Math.floor((days + start.getDay()) / 7) + 1);
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
