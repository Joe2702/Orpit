import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseAll, guessCategory, type SmsMessage, type ParsedSms } from './smsParse';
import type { AppState, Txn } from '../types';

// Getting bank messages off the phone and into the ledger.
//
// The reading itself is in `smsParse.ts`, where it is tested. This file is the
// plumbing: ask the native side for messages we have not seen, read them, pick
// a category, send them up. It holds two pieces of local state — whether the
// user turned this on, and how far through the inbox we got — and nothing else.

interface OrbitSmsPlugin {
  check(): Promise<{ available: boolean; granted: boolean }>;
  request(): Promise<{ available: boolean; granted: boolean }>;
  read(o: { since: number; senders?: string[] }): Promise<{ messages: SmsMessage[]; more: boolean }>;
}

const OrbitSms = registerPlugin<OrbitSmsPlugin>('OrbitSms');

const ON_KEY = 'orbit_sms_on';
const MARK_KEY = 'orbit_sms_mark';
const ACC_KEY = 'orbit_sms_account';

/**
 * How far back a first import reaches.
 *
 * Ninety days is enough to make the feature feel immediately useful — the
 * charts fill in and the category learning has something to work from — without
 * rewriting a year of history the user has already entered by hand, which would
 * double every total they have looked at so far.
 */
const FIRST_IMPORT_DAYS = 90;

/** Plain reads and writes; a private-mode browser throwing here is not news. */
const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* nothing to do: the next scan re-reads a little more than it needed to */
  }
};

export const smsSupported = (): boolean => Capacitor.isNativePlatform();
export const smsEnabled = (): boolean => get(ON_KEY) === '1';

/** Which account imported payments are filed against. Null means unassigned. */
export const smsAccount = (): string | null => get(ACC_KEY) || null;
export const setSmsAccount = (id: string | null): void => set(ACC_KEY, id || '');

export async function smsStatus(): Promise<{ available: boolean; granted: boolean }> {
  if (!smsSupported()) return { available: false, granted: false };
  try {
    return await OrbitSms.check();
  } catch {
    return { available: false, granted: false };
  }
}

/**
 * Turn the feature on: ask for the permission, and only record it as on if the
 * permission was actually granted. A switch that stays on while the thing it
 * controls cannot run is how a feature ends up silently doing nothing.
 */
export async function enableSms(): Promise<{ available: boolean; granted: boolean }> {
  if (!smsSupported()) return { available: false, granted: false };
  let st: { available: boolean; granted: boolean };
  try {
    st = await OrbitSms.request();
  } catch {
    return { available: false, granted: false };
  }
  if (st.granted) {
    set(ON_KEY, '1');
    // Start from a fixed window back rather than from zero. See FIRST_IMPORT_DAYS.
    if (!get(MARK_KEY)) set(MARK_KEY, String(Date.now() - FIRST_IMPORT_DAYS * 86400000));
  }
  return st;
}

export function disableSms(): void {
  set(ON_KEY, '');
  // The watermark stays. Turning the feature back on should not re-offer three
  // months of payments that were already imported and possibly already deleted.
}

/** Re-scan from a chosen point, for "import my older messages". */
export function rewindSms(days: number): void {
  set(MARK_KEY, String(Date.now() - days * 86400000));
}

export interface SmsImport {
  /** Rows the server accepted as new. Repeats are not counted. */
  added: number;
  /** Messages that parsed as payments, including ones already imported. */
  read: number;
  state?: AppState;
}

/**
 * The senders worth reading.
 *
 * Bank messages come from short alphanumeric sender ids, and the native side
 * filters on them so personal messages are never fetched at all. The list is
 * matched loosely (a substring, case-insensitively by the provider), which is
 * why a short generic word is not on it — "bank" alone would pull in half an
 * inbox.
 */
const BANK_SENDERS = [
  'NBE', 'CIB', 'QNB', 'BanqueMisr', 'BM', 'AAIB', 'HSBC', 'ADIB', 'Alex Bank',
  'AlexBank', 'Banque', 'Bank', 'CreditAgricole', 'FaisalBank', 'SAIB', 'EGBank',
  'AlBaraka', 'Emirates NBD', 'ENBD', 'Mashreq', 'Attijari', 'Housing',
  'InstaPay', 'Meeza', 'Fawry', 'VodafoneCash', 'Vodafone Cash', 'OrangeCash',
  'EtisalatCash', 'WeCash', 'ValU', 'Halan', 'Telda', 'Lucky',
];

/**
 * Read whatever has arrived since last time and import it.
 *
 * Never throws. This runs on resume, and a refused permission, a locked-down
 * SMS provider or a dead connection are all ordinary states of the world.
 */
export async function syncSms(
  state: AppState,
  push: (items: SmsRow[]) => Promise<AppState>
): Promise<SmsImport> {
  const none: SmsImport = { added: 0, read: 0 };
  if (!smsSupported() || !smsEnabled()) return none;

  let batch: { messages: SmsMessage[]; more: boolean };
  const since = Number(get(MARK_KEY)) || Date.now() - FIRST_IMPORT_DAYS * 86400000;
  try {
    const st = await OrbitSms.check();
    if (!st.available || !st.granted) return none;
    batch = await OrbitSms.read({ since, senders: BANK_SENDERS });
  } catch {
    return none;
  }

  if (!batch.messages.length) return none;

  // Advance the watermark to the newest message *read*, not the newest
  // imported: a message that did not parse is still a message we have seen, and
  // re-reading it on every resume forever would be pure waste.
  const newest = batch.messages.reduce((m, x) => Math.max(m, x.ts), since);

  const parsed = parseAll(batch.messages, state.profile.currency || 'EGP');
  if (!parsed.length) {
    set(MARK_KEY, String(newest));
    return none;
  }

  const rows = parsed.map((p) => toRow(p, state));
  // Which entries existed before, so what the server actually took can be
  // counted by difference. The server drops repeats silently — it has to, since
  // a second device would otherwise import the same payment — so "how many were
  // new" is not something the response can be asked for without giving this
  // endpoint a different shape from every other write. See api.importSms.
  const had = new Set(state.txns.map((t) => t.id));
  try {
    const next = await push(rows);
    // Only after the server has them. If the push failed, the watermark stays
    // where it was and the same messages are offered again next time — the
    // unique key on the server makes that safe to repeat.
    set(MARK_KEY, String(newest));
    return {
      added: next.txns.filter((t) => t.sms && !had.has(t.id)).length,
      read: parsed.length,
      state: next,
    };
  } catch {
    return none;
  }
}

export interface SmsRow {
  key: string;
  name: string;
  cat: string;
  amount: number;
  income: boolean;
  accId: string | null;
  note: string | null;
  ts: number;
}

/** Turn a read message into the row the server stores. */
function toRow(p: ParsedSms, state: AppState): SmsRow {
  const known = state.fcats
    .filter((c) => (p.income ? c.kind === 'income' : c.kind === 'expense'))
    .map((c) => c.name);
  const history: Pick<Txn, 'name' | 'cat' | 'income'>[] = state.txns;

  // The card's last four digits are the one part of the message worth keeping:
  // it is how the user tells two of their own cards apart. The message text
  // itself stays on the phone.
  const bits: string[] = ['From SMS'];
  if (p.card) bits.push(`card ${p.card}`);
  if (p.currency && p.currency !== (state.profile.currency || 'EGP')) bits.push(p.currency);

  return {
    key: p.key,
    name: p.merchant,
    cat: guessCategory(p.merchant, p.income, history, known),
    amount: p.amount,
    income: p.income,
    accId: smsAccount(),
    note: bits.join(' · '),
    ts: p.ts,
  };
}
