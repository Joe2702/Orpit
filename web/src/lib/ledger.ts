import type { Account, AppState, Txn } from '../types';
import type { ParsedSms } from './smsParse';
import { canonicalFor, categoryFor, cleanMerchant, linkFor, merchantKey, type AccountLink } from './merchants';

// From read messages to ledger rows.
//
// smsParse reads one message at a time. A ledger needs more than that: which of
// the user's accounts it belongs to, what it's worth in their currency, whether
// the same payment already arrived in another message, and whether a debit here
// and a credit there are one transfer between two of their own accounts. That
// is all decided here, without touching the network, so it can be tested.

export interface Fx {
  /** Multiply an amount in the foreign currency by this to get the home currency. */
  rate: number;
  /** A fallback figure, not today's market rate: flag the entry for a look. */
  estimated: boolean;
}

export interface SmsRow {
  key: string;
  name: string;
  cat: string;
  /**
   * Positive, in the home currency. For money going out, fees are included,
   * except on a transfer: the far account only receives the principal, so the
   * fee goes in as its own small expense (see fee).
   */
  amount: number;
  /** A transfer's fee, booked as a separate expense under feeCat. */
  fee?: number;
  feeCat?: string;
  income: boolean;
  /** Money back for a purchase: lowers spending instead of counting as income. */
  refund: boolean;
  link: AccountLink;
  note: string | null;
  ts: number;
  /** Balance the message reported after this payment, for the account it belongs to. */
  balance: number | null;
  review: boolean;
  /** A transfer between the user's own accounts: where the money arrived. */
  toLink?: AccountLink | null;
  toBalance?: number | null;
  /** When the money-in message arrived; its balance is anchored there. */
  toTs?: number;
  /** An existing account to move money into, e.g. Cash for an ATM withdrawal. */
  toAccId?: string | null;
  /** Other messages about this same payment, recorded so they're never imported. */
  alsoKeys?: string[];
  /** The other half of a transfer, already in the ledger from an earlier scan. */
  pairOf?: string | null;
  /** This payment is already in the ledger from another message. */
  dupOf?: string | null;
  /**
   * Possibly the same payment as one the user typed in by hand. Imported
   * anyway, and asked about in "To review": a guess wrong in either direction
   * would silently add or lose money.
   */
  maybeSameAs?: string | null;
  /**
   * The other message of what may be a transfer between the user's own
   * accounts, when nothing in either message proved it. Both are imported as
   * they are and the user is asked.
   */
  pairKey?: string | null;
}

interface Item {
  p: ParsedSms;
  sender: string;
}

const MIN = 60_000;
/** Two messages about one payment arrive within a few minutes of each other. */
const SAME_PAYMENT = 3 * MIN;
/** The two halves of a transfer between banks can be some way apart. */
const SAME_TRANSFER = 45 * MIN;

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
const DAY = 86_400_000;
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Whether two messages are each other's halves of a move between the user's
 * own accounts, and not two unrelated payments of the same amount: one sent to
 * a friend, another received from someone else. An amount and a time are not
 * proof. Any one of these is: a message names the other account's number, or
 * the other bank or wallet; the money went to or came from the user by name;
 * or the user has moved money between these two accounts before.
 */
function provesTransfer(
  sides: { body: string; otherCards: (string | null)[]; otherSenders: string[] }[],
  ownName: string[],
  movedBefore: boolean
): boolean {
  if (movedBefore) return true;
  return sides.some(({ body, otherCards, otherSenders }) => {
    const text = body.toUpperCase();
    if (otherCards.some((c) => c && c.length >= 3 && text.includes(c))) return true;
    if (otherSenders.some((s) => s.length >= 3 && text.includes(s.toUpperCase()))) return true;
    return ownName.some((n) => new RegExp(`(?:\\bTO\\b|\\bFROM\\b|الى|إلى|من)\\s+(?:MRS?\\.?\\s+)?${n}(?![\\p{L}\\p{N}])`, 'u').test(text));
  });
}

/**
 * The account a link points at, if the user already has it. Mirrors the
 * server's match exactly, since this decides what counts as already imported.
 *
 * The same card or account number from the same sender is the same account.
 * Past that, a debit card and the account behind it are one pot of money, so
 * anything that isn't a credit card joins the sender's one non-credit account
 * when there is exactly one. A credit card is always its own account: its
 * spending is debt, not money leaving the bank.
 */
export function accountForLink(accounts: Account[], link: AccountLink): Account | null {
  const sender = link.sender.toLowerCase();
  const card = link.card || null;
  const exact = accounts.find((a) => (a.smsLinks || []).some((l) => l.sender.toLowerCase() === sender && (l.card || null) === card));
  if (exact) return exact;
  if (link.type === 'Credit card') return null;
  const same = accounts.filter((a) => a.type !== 'Credit card' && (a.smsLinks || []).some((l) => l.sender.toLowerCase() === sender));
  return same.length === 1 ? same[0] : null;
}

/**
 * The most recent category the user gave this merchant, if they ever did.
 * Only from entries a person chose: learning from the import's own guesses
 * would just repeat the first wrong one forever.
 */
function learnedCategory(history: Txn[], name: string, income: boolean): string | null {
  const key = merchantKey(name);
  if (!key) return null;
  // "XYZ Trading" as imported and "XYZ Trading Co" as typed are one shop.
  const same = (k: string) => k === key || (Math.min(k.length, key.length) >= 5 && (k.startsWith(key) || key.startsWith(k)));
  const hit = history.find(
    (t) => !t.auto && !t.toAccId && !t.adjust && t.income === income && t.cat && t.cat !== 'Other' && same(merchantKey(t.name))
  );
  return hit ? hit.cat : null;
}

/** A name for the entry when the message only said which bank it was. */
function genericName(p: ParsedSms, generic: boolean, merchant: string): string {
  if (!generic) return merchant;
  if (p.atm) return 'Cash withdrawal';
  if (p.salary) return 'Salary';
  if (p.refund) return 'Refund';
  if (p.income) return p.transfer ? 'Money received' : 'Money in';
  return p.transfer ? 'Money sent' : 'Card payment';
}

export function buildRows(
  items: Item[],
  ctx: { home: string; state: AppState; fx: Record<string, Fx> }
): SmsRow[] {
  const { home, state } = ctx;
  const history = [...state.txns].sort((a, b) => b.ts - a.ts);
  const expenseCats = state.fcats.filter((c) => c.kind === 'expense').map((c) => c.name);
  const incomeCats = state.fcats.filter((c) => c.kind === 'income').map((c) => c.name);
  const cashAccount = state.accounts.find((a) => /cash/i.test(a.type) && !(a.smsLinks || []).length) || null;

  type Draft = SmsRow & { principal: number; transferish: boolean; rawFee: number; body: string };
  // The user's name as a bank would print it, for "sent to YOUSSIF M".
  const ownName = (state.profile?.name || '')
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const movedBetween = (a: Account | null, b: Account | null) =>
    !!a &&
    !!b &&
    state.txns.some((t) => t.toAccId && ((t.accId === a.id && t.toAccId === b.id) || (t.accId === b.id && t.toAccId === a.id)));
  const feeCat = categoryFor('Fees', expenseCats);
  const drafts: Draft[] = [];

  for (const { p, sender } of [...items].sort((a, b) => a.p.ts - b.p.ts)) {
    const link = linkFor(sender, p.card, p.instrument);
    let amount = p.amount;
    let principal = p.amount;
    const notes: string[] = [];
    let review = false;

    if (p.currency !== home) {
      const fx = ctx.fx[p.currency];
      if (fx) {
        principal = Math.round(p.amount * fx.rate * 100) / 100;
        amount = principal;
        notes.push(`${p.currency} ${p.amount.toLocaleString('en-US')} at ${fx.rate.toFixed(2)}`);
        if (fx.estimated) review = true;
      } else {
        // No rate at all: keep the figure, say so, and ask for a look rather
        // than pretend dollars are pounds.
        notes.push(`${p.currency} ${p.amount.toLocaleString('en-US')}, not converted`);
        review = true;
      }
    }
    const income = p.income && !p.refund;
    const rawFee = !p.income && p.currency === home ? p.fee : 0;
    if (rawFee > 0) {
      amount = Math.round((amount + rawFee) * 100) / 100;
      notes.push(`includes ${rawFee} in fees`);
    }

    const merchantRaw = p.merchant;
    // "Sent to account ending 1111" yields "account ending" as the payee:
    // words about an account, not anyone's name.
    const generic =
      !merchantRaw ||
      merchantRaw === 'Bank' ||
      merchantKey(merchantRaw) === merchantKey(sender) ||
      /^(?:(?:your|the|an?)\s+)?(?:account|acct|a\/c|card|wallet|mobile|number|iban|ending|beneficiary)\b/i.test(merchantRaw) ||
      !/\p{L}{2}/u.test(merchantRaw);
    const name = genericName(p, generic, generic ? '' : cleanMerchant(merchantRaw, p.body));

    let cat: string;
    const learned = generic ? null : learnedCategory(history, name, income);
    if (learned) cat = learned;
    else {
      const canon = canonicalFor(generic ? p.body : `${name} ${p.body}`, {
        income,
        refund: p.refund,
        atm: p.atm,
        transfer: p.transfer,
        salary: p.salary,
      });
      cat = categoryFor(canon, income ? incomeCats : expenseCats);
      if (canon === 'Other' || canon === 'Income') review = true;
    }

    const balance = p.currency === home && link.type !== 'Credit card' ? p.balance : null;
    const row: Draft = {
      key: p.key,
      name,
      cat,
      amount,
      income,
      refund: p.refund,
      link,
      note: notes.length ? notes.join(' · ') : null,
      ts: p.ts,
      balance,
      review,
      principal,
      rawFee,
      body: p.body,
      transferish: p.transfer || link.type === 'Wallet',
    };
    if (p.atm && cashAccount) {
      row.toAccId = cashAccount.id;
      row.cat = 'Transfer';
      row.review = false;
    }
    drafts.push(row);
  }

  // 1. The same payment, told twice: a card alert and an account alert, or an
  //    English and an Arabic copy. Keep the first, fill its gaps from the second.
  const kept: Draft[] = [];
  for (const d of drafts) {
    const twin = kept.find(
      (k) =>
        k.income === d.income &&
        k.refund === d.refund &&
        close(k.principal, d.principal) &&
        Math.abs(k.ts - d.ts) <= SAME_PAYMENT &&
        k.link.sender === d.link.sender &&
        // The card alert and the account alert for one purchase carry
        // different numbers, and both are the same money. Only a credit card
        // is a separate account whose number has to agree.
        (!k.link.card ||
          !d.link.card ||
          k.link.card === d.link.card ||
          (k.link.type !== 'Credit card' && d.link.type !== 'Credit card'))
    );
    if (twin) {
      twin.alsoKeys = [...(twin.alsoKeys || []), d.key];
      if (twin.balance == null) twin.balance = d.balance;
      if (!twin.link.card && d.link.card) twin.link = d.link;
      if (/^(Card payment|Money (in|sent|received))$/.test(twin.name) && !/^(Card payment|Money (in|sent|received))$/.test(d.name)) {
        twin.name = d.name;
        twin.cat = d.cat;
        twin.review = d.review;
      }
      continue;
    }
    kept.push(d);
  }

  // 2. Already in the ledger from an earlier scan, through another message.
  for (const d of kept) {
    const acc = accountForLink(state.accounts, d.link);
    if (!acc) continue;
    const mine = new Set([d.key, ...(d.alsoKeys || [])]);
    const existing = state.txns.find(
      (t) =>
        t.sms &&
        !mine.has(t.smsKey || '') &&
        t.accId === acc.id &&
        !t.toAccId &&
        Math.abs(t.ts - d.ts) <= SAME_PAYMENT &&
        (close(Math.abs(t.amount), d.amount) || close(Math.abs(t.amount), d.principal)) &&
        (t.amount > 0) === (d.income || d.refund)
    );
    if (existing) d.dupOf = existing.id;
  }

  // 2b. Typed in by hand as well: a coffee logged at the till, then the bank's
  //     message about it. Hand-typed entries carry the day, not the minute, and
  //     often the default account, so the match is the amount and the day.
  //     Asked about rather than dropped: two real coffees of the same price on
  //     one day are not rare.
  const claimed = new Set<string>();
  for (const d of kept) {
    if (d.dupOf || d.toAccId) continue;
    const typed = state.txns.find(
      (t) =>
        !t.sms &&
        !t.toAccId &&
        !t.adjust &&
        !claimed.has(t.id) &&
        (t.amount > 0) === (d.income || d.refund) &&
        (close(Math.abs(t.amount), d.amount) || close(Math.abs(t.amount), d.principal)) &&
        (sameDay(t.ts, d.ts) || Math.abs(t.ts - d.ts) < DAY)
    );
    if (typed) {
      claimed.add(typed.id);
      d.maybeSameAs = typed.id;
      d.review = true;
    }
  }

  // 3. A transfer between two of the user's own accounts arrives as two
  //    messages: money out of one, money into the other. Counted separately,
  //    it reads as spending and income that never happened. Pair them into one.
  const used = new Set<Draft>();
  for (const out of kept) {
    if (out.income || out.refund || out.dupOf || out.toAccId || used.has(out)) continue;
    const into = kept.find(
      (c) =>
        c !== out &&
        !used.has(c) &&
        c.income &&
        !c.dupOf &&
        close(c.principal, out.principal) &&
        Math.abs(c.ts - out.ts) <= SAME_TRANSFER &&
        (c.link.sender !== out.link.sender || c.link.card !== out.link.card) &&
        (c.transferish || out.transferish)
    );
    if (!into) continue;
    const outAcc = accountForLink(state.accounts, out.link);
    const inAcc = accountForLink(state.accounts, into.link);
    const proven = provesTransfer(
      [
        { body: out.body, otherCards: [into.link.card], otherSenders: into.link.sender !== out.link.sender ? [into.link.sender] : [] },
        { body: into.body, otherCards: [out.link.card], otherSenders: into.link.sender !== out.link.sender ? [out.link.sender] : [] },
      ],
      ownName,
      movedBetween(outAcc, inAcc)
    );
    if (!proven) {
      // Both stay as they are, each pointing at the other, and the review
      // inbox offers to make them one transfer.
      out.pairKey = into.key;
      into.pairKey = out.key;
      out.review = true;
      into.review = true;
      used.add(out);
      used.add(into);
      continue;
    }
    used.add(into);
    out.toLink = into.link;
    out.toBalance = into.balance;
    out.toTs = into.ts;
    out.alsoKeys = [...(out.alsoKeys || []), into.key, ...(into.alsoKeys || [])];
    out.cat = 'Transfer';
    out.name = 'Transfer';
    out.review = false;
  }
  let rows = kept.filter((d) => !used.has(d) || d.pairKey);

  // 4. The other half was imported earlier: the server turns the two into one transfer.
  for (const d of rows) {
    if (d.toLink || d.toAccId || d.dupOf || d.pairKey || d.refund || !d.transferish) continue;
    const acc = accountForLink(state.accounts, d.link);
    const mine = new Set([d.key, ...(d.alsoKeys || [])]);
    const other = state.txns.find(
      (t) =>
        t.sms &&
        !mine.has(t.smsKey || '') &&
        !t.toAccId &&
        !t.adjust &&
        t.accId &&
        t.accId !== acc?.id &&
        Math.abs(t.ts - d.ts) <= SAME_TRANSFER &&
        (t.amount > 0) !== d.income &&
        (close(Math.abs(t.amount), d.principal) || close(Math.abs(t.amount), d.amount))
    );
    if (!other) continue;
    const otherAcc = state.accounts.find((a) => a.id === other.accId) || null;
    const proven = provesTransfer(
      [
        {
          body: d.body,
          otherCards: (otherAcc?.smsLinks || []).map((l) => l.card),
          otherSenders: (otherAcc?.smsLinks || []).map((l) => l.sender).filter((x) => x.toLowerCase() !== d.link.sender.toLowerCase()),
        },
      ],
      ownName,
      movedBetween(acc, otherAcc)
    );
    // Name and category stay as read: if the server finds the other entry has
    // since been edited by hand, it files this one as an ordinary payment.
    if (proven) d.pairOf = other.id;
    else if (other.smsKey) {
      d.pairKey = other.smsKey;
      d.review = true;
    }
  }

  return rows.map(({ principal, transferish, rawFee, body, ...r }) => {
    // A transfer moves the principal; its fee is spending of its own.
    if ((r.toLink || r.toAccId || r.pairOf) && rawFee > 0) {
      r.amount = principal;
      r.fee = rawFee;
      r.feeCat = feeCat;
      r.note = (r.note || '').replace(/(?: · )?includes [\d.]+ in fees/, '') || null;
    }
    return r;
  });
}

/**
 * An account's balance today, or at the end of any earlier moment.
 *
 * When a bank message has reported the balance, that figure is the truth as of
 * that moment: later entries are added to it, and for an earlier moment the
 * entries in between are taken back off. Without one, it is the opening balance
 * plus everything logged. The first keeps the app equal to the bank however
 * many payments were missed or typed by hand; the second is all a cash wallet
 * can have.
 */
export function accountBalance(a: Account, all: Txn[], archived = 0, at = Infinity): number {
  const anchor = a.smsBalance != null && a.smsBalanceTs != null ? a.smsBalanceTs : null;
  const effect = (t: Txn) => (t.accId === a.id ? t.amount : 0) + (t.toAccId === a.id ? Math.abs(t.amount) : 0);
  let bal: number;
  if (anchor == null) {
    bal = (a.opening || 0) + archived;
    for (const t of all) if (t.ts < at) bal += effect(t);
  } else if (at > anchor) {
    bal = Number(a.smsBalance);
    for (const t of all) if (t.ts > anchor && t.ts < at) bal += effect(t);
  } else {
    bal = Number(a.smsBalance);
    for (const t of all) if (t.ts >= at && t.ts <= anchor) bal -= effect(t);
  }
  return Math.round(bal * 100) / 100;
}
