import { Capacitor, registerPlugin } from '@capacitor/core';
import { analyseSms, guessCategory, SKIP_LABEL, type SmsMessage, type ParsedSms } from './smsParse';
import type { AppState, Txn } from '../types';

// Getting bank messages off the phone and into the ledger.
//
// The reading itself is in `smsParse.ts`, where it is tested. This file is the
// plumbing: ask the native side for messages we have not seen, read them, pick
// a category, send them up. It keeps three things on the device — whether the
// user turned this on, how far through the inbox it got, and a record of the
// last scan for the diagnostic in Settings — and nothing else.

interface OrbitSmsPlugin {
  check(): Promise<{ available: boolean; granted: boolean }>;
  request(): Promise<{ available: boolean; granted: boolean }>;
  read(o: { since: number; senders?: string[] }): Promise<{
    messages: SmsMessage[];
    more: boolean;
    /** Inbox rows examined, banks or not. Absent on builds before this field. */
    scanned?: number;
    /** Timestamp of the last row examined. */
    scannedUntil?: number;
  }>;
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

// ---------------------------------------------------------------------------
// Diagnostics
//
// The first version of this feature failed silently: a native error, a bank
// whose sender id wasn't on a list, a message in Arabic — each produced the same
// result, nothing, with no way for anyone to tell which. Every scan now leaves
// a record of what it saw, kept on the device and shown in Settings, so "it
// doesn't work" becomes "my bank's messages say 'no amount found'".
//
// The record holds a short snippet of each recent bank message so the user can
// recognise it. It is the user's own SMS on the user's own phone, never sent
// anywhere, and limited to the last few messages from alphanumeric senders.

export interface SmsDiagEntry {
  sender: string;
  snippet: string;
  ts: number;
  /** 'imported', 'duplicate' or a human-readable reason it was skipped. */
  outcome: string;
  ok: boolean;
}

export interface SmsDiag {
  at: number;
  /** Inbox messages looked at. */
  scanned: number;
  /** Of those, how many came from a bank-like sender. */
  fromBanks: number;
  /** Of those, how many read as payments. */
  parsed: number;
  /** Of those, how many were new to the server. */
  added: number;
  error: string | null;
  recent: SmsDiagEntry[];
}

const DIAG_KEY = 'orbit_sms_diag';
const PARSER_KEY = 'orbit_sms_parser';
/** Bump whenever smsParse learns to read something it used to skip. */
const PARSER_VERSION = 2;

export function smsDiag(): SmsDiag | null {
  try {
    const v = JSON.parse(get(DIAG_KEY) || 'null');
    return v && typeof v.at === 'number' ? (v as SmsDiag) : null;
  } catch {
    return null;
  }
}

const saveDiag = (d: SmsDiag) => set(DIAG_KEY, JSON.stringify(d));

/** Batches per scan. 10 × 500 messages is far beyond any real catch-up. */
const MAX_BATCHES = 10;

/**
 * Read whatever has arrived since last time and import it.
 *
 * Never throws. This runs on resume, and a refused permission, a locked-down
 * SMS provider or a dead connection are all ordinary states of the world — but
 * each one is now written to the diagnostic rather than swallowed.
 */
export async function syncSms(
  state: AppState,
  push: (items: SmsRow[]) => Promise<AppState>
): Promise<SmsImport> {
  const none: SmsImport = { added: 0, read: 0 };
  if (!smsSupported() || !smsEnabled()) return none;

  const home = state.profile.currency || 'EGP';
  const diag: SmsDiag = { at: Date.now(), scanned: 0, fromBanks: 0, parsed: 0, added: 0, error: null, recent: [] };
  const fail = (msg: string): SmsImport => {
    saveDiag({ ...diag, error: msg });
    return none;
  };

  // When the reader improves, look again at messages it already passed over.
  // The first version could not read Arabic, yet still moved its watermark past
  // every Arabic alert it saw, so without this those payments would never be
  // looked at again. Re-reading is safe: the server drops anything it already
  // has, by message key.
  if ((Number(get(PARSER_KEY)) || 0) < PARSER_VERSION) {
    set(MARK_KEY, String(Date.now() - FIRST_IMPORT_DAYS * 86400000));
    set(PARSER_KEY, String(PARSER_VERSION));
  }

  let since = Number(get(MARK_KEY)) || Date.now() - FIRST_IMPORT_DAYS * 86400000;
  const messages: SmsMessage[] = [];
  let reachedUntil = since;
  try {
    const st = await OrbitSms.check();
    if (!st.available) return fail('This phone does not receive SMS.');
    if (!st.granted) return fail('Permission to read messages was turned off in Android settings.');
    for (let i = 0; i < MAX_BATCHES; i++) {
      const batch = await OrbitSms.read({ since });
      messages.push(...batch.messages);
      diag.scanned += batch.scanned ?? batch.messages.length;
      const newest = batch.messages.reduce((m, x) => Math.max(m, x.ts), 0);
      reachedUntil = Math.max(reachedUntil, batch.scannedUntil ?? 0, newest);
      if (!batch.more || reachedUntil <= since) break;
      since = reachedUntil;
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  diag.fromBanks = messages.length;

  // Read every message, keeping the reason for each one that is skipped.
  const parsed: ParsedSms[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    const a = analyseSms(m, home);
    const entry: SmsDiagEntry = {
      sender: m.sender,
      snippet: m.body.replace(/\s+/g, ' ').trim().slice(0, 90),
      ts: m.ts,
      outcome: a.ok ? 'Read as a payment' : SKIP_LABEL[a.reason],
      ok: a.ok,
    };
    if (a.ok && !seen.has(a.parsed.key)) {
      seen.add(a.parsed.key);
      parsed.push(a.parsed);
    }
    diag.recent.push(entry);
  }
  diag.recent = diag.recent.slice(-12).reverse();
  diag.parsed = parsed.length;

  if (!parsed.length) {
    set(MARK_KEY, String(reachedUntil));
    saveDiag(diag);
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
    set(MARK_KEY, String(reachedUntil));
    diag.added = next.txns.filter((t) => t.sms && !had.has(t.id)).length;
    saveDiag(diag);
    return { added: diag.added, read: parsed.length, state: next };
  } catch (e) {
    return fail(`Read ${parsed.length} payment${parsed.length === 1 ? '' : 's'} but could not save them: ${e instanceof Error ? e.message : 'no connection'}. Will retry.`);
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
