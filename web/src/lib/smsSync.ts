import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { analyseSms, SKIP_LABEL, type SmsMessage, type ParsedSms } from './smsParse';
import { buildRows, type Fx, type SmsRow } from './ledger';
import type { AppState } from '../types';
import { ensureNotificationPermission } from './notify';

// Getting bank messages off the phone and into the ledger.
//
// The reading is in `smsParse.ts` and the bookkeeping (accounts, currency,
// duplicates, transfers) in `ledger.ts`, both tested. This file is the
// plumbing: ask the native side for messages we have not seen, read them, get
// the day's exchange rates if any are foreign, send the rows up. It keeps on
// the device whether the user turned this on, how far through the inbox it got,
// a record of the last scan for the diagnostic in Settings, and the text of
// recent bank messages so an entry can show what it was read from. None of the
// text leaves the phone.

interface OrbitSmsPlugin {
  /** `live`: may also be told about messages as they arrive. Absent on older builds. */
  check(): Promise<{ available: boolean; granted: boolean; live?: boolean }>;
  request(): Promise<{ available: boolean; granted: boolean; live?: boolean }>;
  /** Mirror the switch for the native receiver, which runs without this layer. */
  setLive(o: { on: boolean }): Promise<{ available: boolean; granted: boolean; live?: boolean }>;
  addListener(event: 'message', fn: (e: { sender: string }) => void): Promise<PluginListenerHandle>;
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
const TEXT_KEY = 'orbit_sms_texts';
const FX_KEY = 'orbit_fx';

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

export async function smsStatus(): Promise<{ available: boolean; granted: boolean }> {
  if (!smsSupported()) return { available: false, granted: false };
  try {
    return await OrbitSms.check();
  } catch {
    return { available: false, granted: false };
  }
}

/**
 * What turning this on means, shown before Android's own permission prompt.
 * Google Play requires it, and it is the honest order anyway: say what is read
 * and what leaves the phone, then ask. Every place that turns the feature on
 * shows this first.
 */
export const SMS_DISCLOSURE = {
  title: 'Track payments from bank messages?',
  message:
    'Orbit will read text messages from banks and wallets on this phone (never messages from phone numbers) and turn payment alerts into transactions, including new ones as they arrive. ' +
    'The message text stays on your phone. Only what Orbit reads from it is saved to your account: the amount, the shop, the date, which bank, the last four digits of the card and the balance. ' +
    'You can turn this off any time.',
  confirmLabel: 'Continue',
};

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
    await OrbitSms.setLive({ on: true }).catch(() => {});
    // The alert for a payment that arrives while the app is closed is a
    // notification; without this permission it silently never shows.
    await ensureNotificationPermission();
  }
  return st;
}

/**
 * Instant capture for an install that turned bank messages on before it
 * existed: the second permission is in the same group as the first, so Android
 * grants it without asking, and the native switch is set to match.
 */
export async function ensureLiveSms(): Promise<void> {
  if (!smsSupported() || !smsEnabled()) return;
  try {
    const st = await OrbitSms.check();
    if (st.granted && st.live === false) await OrbitSms.request();
    await OrbitSms.setLive({ on: true });
  } catch {
    /* an older native build without these methods: the scan on open still works */
  }
}

/** Called when a bank message arrives while the app is open. */
export function onSmsArrived(fn: () => void): () => void {
  if (!smsSupported()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let gone = false;
  OrbitSms.addListener('message', () => fn())
    .then((h) => {
      if (gone) h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    gone = true;
    handle?.remove();
  };
}

export function disableSms(): void {
  set(ON_KEY, '');
  if (smsSupported()) OrbitSms.setLive({ on: false }).catch(() => {});
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
/**
 * Bump whenever smsParse or ledger learns to read something better. A rescan
 * is safe: the server rewrites only entries still as an import left them.
 */
const PARSER_VERSION = 3;

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
  push: (items: SmsRow[]) => Promise<AppState>,
  getRates?: GetRates
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
  const parsed: { p: ParsedSms; sender: string }[] = [];
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
      parsed.push({ p: a.parsed, sender: m.sender });
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

  const fx = await ratesFor(home, parsed.map((x) => x.p.currency), getRates);
  const rows = buildRows(parsed, { home, state, fx });
  keepTexts(rows, parsed);

  // Which entries existed before, so what the server actually took can be
  // counted by difference. The server drops repeats silently — it has to, since
  // a second device would otherwise import the same payment — so "how many were
  // new" is not something the response can be asked for without giving this
  // endpoint a different shape from every other write. See api.importSms.
  const had = new Set(state.txns.map((t) => t.id));
  try {
    let next = state;
    // A first scan or a rescan can be hundreds of rows; the server takes 300
    // at a time, and smaller requests survive a weak connection better.
    for (let i = 0; i < rows.length; i += PUSH_SIZE) next = await push(rows.slice(i, i + PUSH_SIZE));
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

const PUSH_SIZE = 150;

// ---------------------------------------------------------------------------
// Exchange rates

/**
 * Rough values of common currencies in US dollars, for when the day's rates
 * can't be fetched. Entries converted with these are flagged for a look; they
 * are here so a dollar charge lands near its real size instead of as dollars
 * counted as pounds.
 */
const USD_PER: Record<string, number> = {
  USD: 1,
  EGP: 1 / 48.5,
  EUR: 1.08,
  GBP: 1.27,
  SAR: 0.2667,
  AED: 0.2723,
  KWD: 3.25,
  QAR: 0.2747,
  BHD: 2.65,
  OMR: 2.6,
  JOD: 1.41,
  TRY: 0.029,
  CHF: 1.13,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0067,
  CNY: 0.14,
  INR: 0.012,
};

type GetRates = (base: string) => Promise<{ rates: Record<string, number>; at: number }>;

/**
 * A rate for each foreign currency in the batch. The day's rates come from the
 * server and are kept here for twelve hours; failing that, the last ones
 * fetched (still a real rate, a little old); failing that, the rough table.
 */
export async function ratesFor(home: string, currencies: string[], getRates?: GetRates): Promise<Record<string, Fx>> {
  const want = [...new Set(currencies.filter((c) => c && c !== home))];
  if (!want.length) return {};
  let cached: { base: string; rates: Record<string, number>; at: number } | null = null;
  try {
    cached = JSON.parse(get(FX_KEY) || 'null');
  } catch {
    cached = null;
  }
  if (cached?.base !== home) cached = null;
  if ((!cached || Date.now() - cached.at > 12 * 3600_000) && getRates) {
    try {
      const r = await getRates(home);
      cached = { base: home, rates: r.rates, at: r.at || Date.now() };
      set(FX_KEY, JSON.stringify(cached));
    } catch {
      /* the cache or the table below */
    }
  }
  const out: Record<string, Fx> = {};
  for (const c of want) {
    const live = cached?.rates[c];
    if (live && isFinite(live)) out[c] = { rate: live, estimated: false };
    else if (USD_PER[c] && USD_PER[home]) out[c] = { rate: USD_PER[c] / USD_PER[home], estimated: true };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The messages entries were read from

interface KeptText {
  sender: string;
  body: string;
  ts: number;
  /** Other messages about the same payment: a twin alert, a transfer's other half. */
  more?: { sender: string; body: string; ts: number }[];
}

const KEEP_TEXTS = 600;

function readTexts(): Record<string, KeptText> {
  try {
    const v = JSON.parse(get(TEXT_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function keepTexts(rows: SmsRow[], parsed: { p: ParsedSms; sender: string }[]) {
  const byKey = new Map(parsed.map((x) => [x.p.key, x]));
  const all = readTexts();
  for (const r of rows) {
    const own = byKey.get(r.key);
    if (!own) continue;
    const more = (r.alsoKeys || [])
      .map((k) => byKey.get(k))
      .filter((x): x is { p: ParsedSms; sender: string } => !!x)
      .map((x) => ({ sender: x.sender, body: x.p.body, ts: x.p.ts }));
    all[r.key] = { sender: own.sender, body: own.p.body, ts: own.p.ts, ...(more.length ? { more } : {}) };
  }
  const keep = Object.entries(all)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, KEEP_TEXTS);
  set(TEXT_KEY, JSON.stringify(Object.fromEntries(keep)));
}

/** The bank message an imported entry was read from, if this phone still has it. */
export function smsText(key: string | null | undefined): KeptText | null {
  if (!key) return null;
  return readTexts()[key.replace(/:fee$/, '')] || null;
}
