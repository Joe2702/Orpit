import React, { useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { ago, money, fmtDate, relLabel, moneySymbol } from '../lib/format';
import { guessFinIcon, FinIcon } from '../lib/iconPaths';
import { Ring } from '../lib/charts';
import { BackButton, chip } from '../ui';
import { IconTrash } from '../icons';
import { SwipeRow } from '../SwipeRow';
import { StickySave } from '../StickySave';
import { ReceiptField, ReceiptPicker } from '../Receipt';
import { useEntryActions } from '../lib/entryActions';
import type { Txn } from '../types';
import { isRefund } from '../lib/money';
import { merchantKey } from '../lib/merchants';
import { smsText } from '../lib/smsSync';
import { findRecurring, type FoundRecurring } from '../lib/subscriptions';
import { UnsyncedDot } from '../UnsyncedDot';

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  const { go } = useStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <BackButton onClick={() => go('finances')} />
      <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{title}</div>
      {action}
    </div>
  );
}

function fcatByName(fcats: { name: string; icon: string; color: string }[], name: string) {
  return fcats.find((c) => c.name === name) || { ...guessFinIcon(name), name };
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} className="press92" role="button" aria-label="Add" style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <svg width="18" height="18" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2.2, strokeLinecap: 'round' }} aria-hidden><path d="M10 4v12M4 10h12" /></svg>
    </div>
  );
}

// ================= Add / edit transaction (full screen) =================
export function FAddTx() {
  const { state, screenData, go, mutateOpt, haptic, confirm } = useStore();
  const edit: Txn | undefined = screenData?.edit;
  const fcats = state!.fcats;
  const accounts = state!.accounts;
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>(
    edit ? (edit.toAccId ? 'transfer' : edit.income ? 'income' : 'expense') : 'expense'
  );
  // Money back for a purchase: kept with spending, and taken off it.
  const [refund, setRefund] = useState<boolean>(!!edit && isRefund(edit));
  const source = edit?.sms ? smsText(edit.smsKey) : null;
  const [showSource, setShowSource] = useState(false);
  const [amount, setAmount] = useState<string>(edit ? String(Math.abs(edit.amount)) : '');
  const [exCat, setExCat] = useState<string>(edit && !edit.income ? edit.cat : fcats.find((c) => c.kind === 'expense')?.name || 'Food');
  const [incCat, setIncCat] = useState<string>(edit && edit.income ? edit.cat : fcats.find((c) => c.kind === 'income')?.name || 'Salary');
  const [accId, setAccId] = useState<string>(edit?.accId || accounts[0]?.id || '');
  // Where a transfer lands. Defaults to the first account that isn't the source,
  // so the form is never sitting on the one combination it must refuse.
  const [toAccId, setToAccId] = useState<string>(
    edit?.toAccId || accounts.find((a) => a.id !== (edit?.accId || accounts[0]?.id))?.id || ''
  );
  const [date, setDate] = useState<string>(edit ? new Date(edit.ts).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>(edit?.note || '');
  // Only used when creating: an existing transaction manages its receipt
  // directly through ReceiptField, which uploads on the spot.
  const [newPhoto, setNewPhoto] = useState<string | null>(null);

  const isTransfer = kind === 'transfer';
  const income = kind === 'income';
  const cat = isTransfer ? 'Transfer' : income ? incCat : exCat;
  const fromAcc = accounts.find((a) => a.id === accId);
  const toAcc = accounts.find((a) => a.id === toAccId);
  // Two accounts, both real, and not the same one.
  const transferOk = !isTransfer || (!!accId && !!toAccId && accId !== toAccId);

  // Choosing the source that the destination already occupies would leave the
  // form in a state it can't save, so the other side steps aside.
  const pickFrom = (id: string) => {
    setAccId(id);
    if (isTransfer && id === toAccId) setToAccId(accounts.find((a) => a.id !== id)?.id || '');
  };
  const pickTo = (id: string) => {
    setToAccId(id);
    if (id === accId) setAccId(accounts.find((a) => a.id !== id)?.id || '');
  };

  const press = (k: string) => {
    if (k === 'del') { setAmount((a) => a.slice(0, -1)); return; }
    setAmount((v) => {
      if (k === '.' && v.includes('.')) return v;
      if (v.replace('.', '').length >= 7) return v;
      if (v.includes('.') && v.split('.')[1].length >= 2) return v;
      return v + k;
    });
  };

  const save = async () => {
    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0 || !transferOk) return;
    // Typing in a payment the bank's message already brought in counts it
    // twice. Asked, not blocked: two of the same coffee in a day happens.
    if (!edit && !isTransfer) {
      const day = new Date(date + 'T12:00:00').toDateString();
      const seen = state!.txns.find(
        (t) =>
          t.sms && !t.toAccId && (t.amount > 0) === (income || refund) && Math.abs(Math.abs(t.amount) - amt) < 0.01 && new Date(t.ts).toDateString() === day
      );
      if (seen) {
        const ok = await confirm({
          title: 'Already added from your bank?',
          message: `${seen.name} · ${money(seen.amount)} · ${state!.accounts.find((a) => a.id === seen.accId)?.name || 'imported'} at ${new Date(seen.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} came in from your bank messages today. Add this one as well?`,
          confirmLabel: 'Add anyway',
        });
        if (!ok) return;
      }
    }
    haptic();
    // An edit keeps the time of day it had: a bank message's 9:41 is worth
    // keeping, and noon would reorder the day's list.
    const ts =
      edit && new Date(edit.ts).toISOString().slice(0, 10) === date ? edit.ts : new Date(date + 'T12:00:00').getTime();
    // An edit keeps its name (a shop, read from the bank) unless it was only
    // ever its category's name.
    const name = isTransfer
      ? `${fromAcc?.name || 'Account'} → ${toAcc?.name || 'Account'}`
      : edit && !edit.toAccId && edit.name !== edit.cat
        ? edit.name
        : cat;
    const isRef = !isTransfer && !income && refund;
    const body = {
      name, cat, amount: amt,
      refund: isRef,
      // A transfer is never income: it leaves the source account, and the money
      // arriving at the other end is derived from toAccId when balances are
      // computed. Storing it as income would double-count it.
      income: isTransfer ? false : income,
      accId,
      toAccId: isTransfer ? toAccId : null,
      note: note.trim() || null, ts,
    };
    const signed = isTransfer || (!income && !isRef) ? -amt : amt;
    // Update the list immediately and leave the screen; the server call settles
    // in the background. Waiting on a sleepy free-tier host made saving feel
    // broken even though it always worked.
    const tempId = 'tmp_' + Date.now();
    mutateOpt(
      (s) => ({
        ...s,
        txns: edit
          ? s.txns.map((t) => (t.id === edit.id ? { ...t, ...body, amount: signed, ts, review: false, auto: false } : t))
          : [...s.txns, { id: tempId, name, cat, amount: signed, income: body.income, accId, toAccId: body.toAccId, adjust: false, note: note.trim() || null, photo: !!newPhoto, ts }],
      }),
      () => (edit ? api.editTxn(edit.id, body) : api.addTxn({ ...body, ...(newPhoto ? { photo: newPhoto } : {}) })),
      edit ? 'Transaction updated' : 'Transaction saved'
    ).catch(() => {});
    go('ftxns');

    // A new category for a shop is usually a new category for the shop, not
    // for one payment. Offer to move the others; never move ones the user
    // already filed somewhere themselves without asking.
    if (edit && !isTransfer && cat !== edit.cat) {
      const k = merchantKey(name);
      const others = k
        ? state!.txns.filter((t) => t.id !== edit.id && !t.toAccId && !t.adjust && t.income === income && t.cat !== cat && merchantKey(t.name) === k)
        : [];
      if (others.length) {
        const ok = await confirm({
          title: `Move all ${name} payments?`,
          message: `${others.length} other ${others.length === 1 ? 'payment' : 'payments'} from ${name} ${others.length === 1 ? 'is' : 'are'} filed elsewhere. Put ${others.length === 1 ? 'it' : 'them'} under ${cat} too? New ones will follow.`,
          confirmLabel: 'Move all',
        });
        if (ok) {
          const ids = others.map((t) => t.id);
          mutateOpt(
            (s) => ({ ...s, txns: s.txns.map((t) => (ids.includes(t.id) ? { ...t, cat, review: false, auto: false } : t)) }),
            () => api.recategorise(ids, cat),
            `${others.length + 1} ${name} payments under ${cat}`
          ).catch(() => {});
        }
      }
    }
  };
  const del = () => {
    if (!edit) return;
    haptic();
    mutateOpt(
      (s) => ({ ...s, txns: s.txns.filter((t) => t.id !== edit.id) }),
      () => api.deleteTxn(edit.id),
      'Transaction deleted'
    ).catch(() => {});
    go('ftxns');
  };

  // Same 44px floor as the range tabs: three targets now share this row, so
  // each is narrower than before and an under-height one is easier to miss.
  const tab = (active: boolean, color: string): React.CSSProperties => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 'calc(11px * var(--sq))', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(active ? { background: 'var(--surface)', color, boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) });
  const catList = fcats.filter((c) => c.kind === kind);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={edit ? (isTransfer ? 'Edit transfer' : 'Edit transaction') : 'Add transaction'} />
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 20 }}>
        <div onClick={() => setKind('expense')} style={tab(kind === 'expense', 'var(--text)')}>Expense</div>
        <div onClick={() => setKind('income')} style={tab(income, 'var(--indigo)')}>Income</div>
        <div onClick={() => setKind('transfer')} style={tab(isTransfer, 'var(--indigo)')}>Transfer</div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--text2)', verticalAlign: 'top', lineHeight: 1.7 }}>{moneySymbol().trim()}</span>
        <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-.03em', color: income ? 'var(--indigo)' : isTransfer ? 'var(--indigo)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{amount === '' ? '0' : amount}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 22 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <div key={k} onClick={() => press(k)} style={{ height: 50, borderRadius: 'calc(14px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', background: 'var(--bg)' }}>
            {k === 'del' ? <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M9 5h10v14H9l-6-7 6-7ZM13 9.5l4 5M17 9.5l-4 5" /></svg> : k}
          </div>
        ))}
      </div>
      {/* A transfer has no category: it isn't spending, so there is nothing to
          categorise. Showing an inert grid would only invite a wrong answer. */}
      {!isTransfer && <>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>Category</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 9, marginBottom: 22 }}>
        {catList.map((c) => {
          const active = cat === c.name;
          return (
            <div key={c.id} onClick={() => (income ? setIncCat(c.name) : setExCat(c.name))} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 'calc(16px * var(--sq))', cursor: 'pointer', transition: 'all .15s', border: `1px solid ${active ? `var(--${c.color})` : 'var(--border)'}`, background: active ? `var(--${c.color})` : 'var(--surface)' }}>
              <FinIcon icon={c.icon} color={active ? '#fff' : `var(--${c.color})`} size={22} />
              <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : 'var(--text)' }}>{c.name}</span>
            </div>
          );
        })}
      </div>
      {kind === 'expense' && (edit ? isRefund(edit) || edit.sms : false) && (
        <div onClick={() => setRefund((v) => !v)} role="switch" aria-checked={refund} className="press99" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -8, marginBottom: 22, cursor: 'pointer' }}>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>
            Money back (a refund)
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Takes it off your spending instead of counting as income</span>
          </span>
          <span style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', background: refund ? 'var(--indigo)' : 'var(--surface2)', border: '1px solid var(--border)', position: 'relative', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 2, left: refund ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .2s' }} />
          </span>
        </div>
      )}
      </>}
      {edit?.sms && (
        // What the entry was read from, so a strange name or amount can be
        // checked against the bank's own words. The text lives on this phone
        // only; another device, or one that was reset, won't have it.
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 14px', marginBottom: 22 }}>
          <div onClick={() => source && setShowSource((v) => !v)} role={source ? 'button' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: source ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
              {source ? `From ${source.sender} · ${fmtDate(source.ts)}` : 'Read from a bank message'}
            </span>
            {source && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)' }}>{showSource ? 'Hide' : 'Show message'}</span>}
          </div>
          {!source && (
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 4 }}>
              The message itself stays on the phone that read it, and isn&rsquo;t on this one.
            </div>
          )}
          {source && showSource && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[source, ...(source.more || [])].map((m, i) => (
                <div key={i} dir="auto" style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 'calc(12px * var(--sq))', padding: '9px 11px', overflowWrap: 'anywhere' }}>
                  {i > 0 && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 3 }}>Also from {m.sender}</div>}
                  {m.body}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{isTransfer ? 'From' : 'Account'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
        {accounts.map((a) => (
          <div key={a.id} onClick={() => pickFrom(a.id)} style={chip(accId === a.id, `var(--${a.color})`)}>{a.name}</div>
        ))}
      </div>
      {isTransfer && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>To</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 10 }}>
            {accounts.filter((a) => a.id !== accId).map((a) => (
              <div key={a.id} onClick={() => pickTo(a.id)} style={chip(toAccId === a.id, `var(--${a.color})`)}>{a.name}</div>
            ))}
          </div>
          {/* The one thing worth saying about transfers, said once, where the
              question actually arises. */}
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 22 }}>
            {accounts.length < 2
              ? 'Add a second account first. A transfer needs somewhere to go.'
              : "Moves money between your own accounts. It won't count as spending or income."}
          </div>
        </>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Date</div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 14px', fontSize: 15, fontWeight: 600, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Note</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      {!isTransfer && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Receipt</div>
          <div style={{ marginBottom: 22 }}>
            {edit ? <ReceiptField txn={edit} /> : <ReceiptPicker value={newPhoto} onChange={setNewPhoto} />}
          </div>
        </>
      )}
      {/* 92 clears the tab bar, which overlays the bottom of the scroll area. */}
      <StickySave
        label={isTransfer ? 'Save transfer' : 'Save transaction'}
        onClick={save}
        enabled={transferOk}
        bottom={92}
      />
      {edit && (
        <div onClick={del} className="press99" style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />Delete transaction
        </div>
      )}
    </div>
  );
}

/**
 * One line of the ledger, the same everywhere it appears.
 *
 * A transfer shows both ends and a neutral colour: it is not a loss, and
 * painting it like an expense is the whole confusion transfers exist to remove.
 * A correction is real money but not an event you did, shown plainly with its
 * direction. A refund says so, so a plus sign on a shop's name isn't a puzzle.
 */
export function TxnRow({ t, onClick, last }: { t: Txn; onClick: () => void; last?: boolean }) {
  const { state } = useStore();
  const accById = Object.fromEntries(state!.accounts.map((a) => [a.id, a]));
  const fc = fcatByName(state!.fcats, t.cat);
  const xfer = !!t.toAccId;
  const adj = t.adjust;
  const refund = isRefund(t);
  const acc = accById[t.accId || '']?.name;
  const sub = xfer
    ? `${accById[t.accId || '']?.name || 'Account'} → ${accById[t.toAccId || '']?.name || 'Account'}`
    : adj
      ? `Balance correction${acc ? ` · ${acc}` : ''}`
      : [refund ? 'Refund' : null, t.cat, acc].filter(Boolean).join(' · ');
  return (
    <div onClick={onClick} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
      <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {xfer ? (
          <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Transfer">
            <path d="M3 7h12M12 4l3 3-3 3M17 13H5M8 10l-3 3 3 3" />
          </svg>
        ) : adj ? (
          <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Balance correction">
            <path d="M4 13.5a6 6 0 0 1 10-4.4M16 6.5a6 6 0 0 1-10 4.4" />
            <path d="M14 5v4h-4M6 15v-4h4" />
          </svg>
        ) : (
          <FinIcon icon={fc.icon} color="var(--text2)" size={20} />
        )}
        {/* Waiting for a look: the category was a guess. A dot, not a badge,
            so a list with a few of them still reads as a list. */}
        {t.review && (
          <span aria-label="Needs a look" style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--indigo)', boxShadow: '0 0 0 2px var(--surface)' }} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
          <UnsyncedDot id={t.id} />
          {t.sms && (
            // Read out of a bank message rather than entered. Worth a tag: a
            // machine picked the name and the category, and the user should be
            // able to see at a glance which figures came from that.
            <span
              style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', color: 'var(--indigo)', background: 'color-mix(in srgb,var(--indigo) 14%,transparent)', borderRadius: 5, padding: '2px 5px', flex: 'none' }}
              aria-label="Imported from a bank message"
            >
              SMS
            </span>
          )}
          {t.photo && (
            <svg width="13" height="13" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.8, strokeLinejoin: 'round', flex: 'none' }} aria-label="Has a receipt">
              <path d="M1.5 4h2.2l1-1.4h3.6L9.3 4h2.2v7h-10z" />
              <circle cx="6.5" cy="7.4" r="2.1" />
            </svg>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flex: 'none', color: xfer || adj ? 'var(--text2)' : 'var(--text)' }}>
        {(xfer ? '' : t.amount >= 0 ? '+' : '−') + money(t.amount)}
      </div>
    </div>
  );
}

// ================= Transactions list (grouped, search, filter) =================
export function FTxns() {
  const { state, go } = useStore();
  const { remove } = useEntryActions();
  const fcats = state!.fcats;
  const accById = Object.fromEntries(state!.accounts.map((a) => [a.id, a]));
  const [q, setQ] = useState('');
  const [fcat, setFcat] = useState('All');
  const [facc, setFacc] = useState('All');

  const [shown, setShown] = useState(80);
  const matched = [...state!.txns]
    .sort((a, b) => b.ts - a.ts)
    .filter((t) => {
      const ql = q.toLowerCase();
      if (ql && !(t.name.toLowerCase().includes(ql) || t.cat.toLowerCase().includes(ql) || (t.note || '').toLowerCase().includes(ql))) return false;
      if (fcat !== 'All' && t.cat !== fcat) return false;
      if (facc !== 'All' && accById[t.accId || '']?.name !== facc) return false;
      return true;
    });
  // Render a page at a time — a year of transactions shouldn't stall the screen.
  const list = matched.slice(0, shown);
  const groups: { label: string; items: Txn[] }[] = [];
  const byDay: Record<string, Txn[]> = {};
  list.forEach((t) => {
    const k = String(new Date(t.ts).setHours(0, 0, 0, 0));
    if (!byDay[k]) { byDay[k] = []; groups.push({ label: relLabel(t.ts), items: byDay[k] }); }
    byDay[k].push(t);
  });

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Transactions" action={<AddBtn onClick={() => go('faddtx')} />} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '0 14px', height: 48, marginBottom: 14 }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l3 3" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" style={{ flex: 1, border: 'none', background: 'none', fontSize: 15, color: 'var(--text)', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 9, paddingBottom: 2 }}>
        {['All', ...fcats.map((c) => c.name)].map((c) => (
          <div key={c} onClick={() => setFcat(c)} style={{ ...chip(fcat === c, 'var(--indigo)'), flex: 'none' }}>{c === 'All' ? 'All categories' : c}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
        {['All', ...state!.accounts.map((a) => a.name)].map((a) => (
          <div key={a} onClick={() => setFacc(a)} style={{ ...chip(facc === a, 'var(--indigo)'), flex: 'none' }}>{a === 'All' ? 'All accounts' : a}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 9, paddingLeft: 2 }}>{g.label}</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              {g.items.map((t) => {
                return (
                  <SwipeRow key={t.id} onEdit={() => go('faddtx', { edit: t })} onDelete={() => remove('txn', t)}>
                    <TxnRow t={t} onClick={() => go('faddtx', { edit: t })} />
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {matched.length > shown && (
        <div onClick={() => setShown(shown + 80)} className="press99" role="button" style={{ marginTop: 16, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          Show older · {matched.length - shown} more
        </div>
      )}
      {matched.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>
          No transactions match your search.
        </div>
      )}
    </div>
  );
}

// ================= To review =================
// Imported entries Orbit wasn't sure about: a shop it didn't know, money in
// from someone, a foreign charge converted at a rough rate. Each shows the
// message it came from, so the answer is usually one tap.
export function FReview() {
  const { state, mutateOpt, mutate, haptic } = useStore();
  const fcats = state!.fcats;
  const byId = new Map(state!.txns.map((t) => [t.id, t]));
  const byKey = new Map(state!.txns.filter((t) => t.smsKey).map((t) => [t.smsKey!, t]));
  const accName = (id: string | null) => state!.accounts.find((a) => a.id === id)?.name || 'an account';
  // A possible transfer is asked about once, on its money-out half.
  const items = [...state!.txns]
    .filter((t) => {
      if (!t.review) return false;
      const other = t.pairKey ? byKey.get(t.pairKey) : undefined;
      return !(other && other.review && !other.toAccId && t.amount > 0 && other.amount < 0);
    })
    .sort((a, b) => b.ts - a.ts);

  const answerSame = (t: Txn, same: boolean) => {
    haptic();
    mutate(() => api.answerSame(t.id, same), same ? 'Kept one, with your category' : 'Kept both').catch(() => {});
  };
  const pair = (t: Txn, other: Txn) => {
    haptic();
    mutate(() => api.pairTxns(t.id, other.id), 'Made it one transfer').catch(() => {});
  };

  // One shop's payments travel together: filing one Talabat order under
  // Eating out files the rest that the import guessed at, but never one the
  // user already chose a category for.
  const sameShop = (t: Txn) => {
    const k = merchantKey(t.name);
    return state!.txns.filter((x) => x.id === t.id || (k && !x.toAccId && !x.adjust && x.income === t.income && (x.auto || x.review) && merchantKey(x.name) === k));
  };

  const setCat = (t: Txn, cat: string) => {
    haptic();
    const ids = sameShop(t).map((x) => x.id);
    const others = ids.length - 1;
    mutateOpt(
      (s) => ({ ...s, txns: s.txns.map((x) => (ids.includes(x.id) ? { ...x, cat, review: false, auto: false } : x)) }),
      () => api.recategorise(ids, cat),
      others > 0 ? `${t.name} → ${cat}, and ${others} more like it` : `Filed under ${cat}`
    ).catch(() => {});
  };
  const looksRight = (ids: string[]) => {
    haptic();
    mutateOpt(
      (s) => ({ ...s, txns: s.txns.map((x) => (ids.includes(x.id) ? { ...x, review: false } : x)) }),
      () => api.markReviewed(ids),
      ids.length > 1 ? 'All marked as checked' : undefined
    ).catch(() => {});
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="To review" />
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)', marginBottom: 6 }}>All checked</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55 }}>
            When Orbit isn&rsquo;t sure what a payment from your bank was, it will wait here for you.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              Read from your bank messages. Pick what each one was, and Orbit remembers the shop.
            </div>
            {items.length > 1 && (
              <div onClick={() => looksRight(items.map((t) => t.id))} role="button" className="press99" style={{ flex: 'none', fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)', cursor: 'pointer', padding: '8px 2px' }}>
                All fine
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((t) => {
              const text = smsText(t.smsKey);
              const typed = t.dupOf ? byId.get(t.dupOf) : undefined;
              const half = t.pairKey ? byKey.get(t.pairKey) : undefined;
              const halfOpen = half && !half.toAccId;
              // The current guess first, so it's visible without scrolling.
              const cats = fcats
                .filter((c) => c.kind === (t.income ? 'income' : 'expense'))
                .sort((a, b) => Number(b.name === t.cat) - Number(a.name === t.cat));
              const acc = state!.accounts.find((a) => a.id === t.accId)?.name;
              return (
                <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{(t.amount >= 0 ? '+' : '−') + money(t.amount)}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                    {[relLabel(t.ts), acc, t.note].filter(Boolean).join(' · ')}
                  </div>
                  {text && (
                    <div dir="auto" style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 'calc(12px * var(--sq))', padding: '9px 11px', marginTop: 10, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {text.body}
                    </div>
                  )}
                  {typed && (
                    // The bank's message and a hand-typed entry, same amount,
                    // same day. Only the user knows if that was one coffee or two.
                    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '11px 12px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)' }}>Did you also add this by hand?</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>
                        {[typed.name !== typed.cat ? typed.name : null, typed.cat, accName(typed.accId), (typed.amount >= 0 ? '+' : '−') + money(typed.amount), relLabel(typed.ts), typed.note]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <div onClick={() => answerSame(t, true)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}>
                          Same payment
                        </div>
                        <div onClick={() => answerSame(t, false)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          Two payments
                        </div>
                      </div>
                    </div>
                  )}
                  {half && halfOpen && (
                    // Money out of one account and the same amount into
                    // another, close together, with nothing in either message
                    // to prove both accounts are the user's.
                    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '11px 12px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)' }}>Moving your own money?</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>
                        {t.amount < 0 ? `${accName(t.accId)} → ${accName(half.accId)}` : `${accName(half.accId)} → ${accName(t.accId)}`}
                        {' · '}
                        {money(Math.abs(half.amount))} {t.amount < 0 ? 'arrived' : 'left'} {relLabel(half.ts).toLowerCase()}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <div onClick={() => pair(t, half)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}>
                          Yes, a transfer
                        </div>
                        <div onClick={() => looksRight([t.id, half.id])} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          No, separate
                        </div>
                      </div>
                    </div>
                  )}
                  {!(half && halfOpen) && (
                  <div style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '12px -16px 0', padding: '0 16px 2px' }}>
                    {cats.map((c) => (
                      <div key={c.id} onClick={() => setCat(t, c.name)} className="press99" style={{ ...chip(t.cat === c.name, 'var(--indigo)'), flex: 'none' }}>
                        {c.name}
                      </div>
                    ))}
                  </div>
                  )}
                  {/* A question above answers this card on its own; a third
                      button beside it would only ask which one to press. */}
                  {!typed && !(half && halfOpen) && (
                    <div onClick={() => looksRight([t.id])} role="button" className="press99" style={{ marginTop: 12, height: 42, borderRadius: 'calc(12px * var(--sq))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                      {t.cat} is right
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ================= Budgets =================
export function FBudgets() {
  const { open } = useStore();
  const { d } = useData();
  const { state } = useStore();
  const totalPct = d.budgetTotal > 0 ? Math.min(100, Math.round((d.budgetSpent / d.budgetTotal) * 100)) : 0;
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Budgets" action={<AddBtn onClick={() => open('budget', { cat: state!.fcats.find((c) => c.kind === 'expense')?.name || 'Food' })} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>This month</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{money(d.budgetSpent)} of {money(d.budgetTotal)}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'var(--indigo)', width: `${totalPct}%` }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.budgets.map((b) => {
          const fc = fcatByName(state!.fcats, b.cat);
          return (
            <div key={b.id} onClick={() => open('budget', { id: b.id, cat: b.cat, limit: b.limit, rollover: b.rollover })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <span style={{ width: 34, height: 34, borderRadius: 'calc(10px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color="var(--text2)" size={18} /></span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{b.cat}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(b.spent)} / {money(b.effLimit)}</span>
              </div>
              {b.carried > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--indigo)', marginTop: -6, marginBottom: 8 }}>
                  +{money(b.carried)} rolled over from last month
                </div>
              )}
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, b.pct)}%`, background: b.color, transition: 'width .4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>
                  {b.pct}% used · <span style={{ color: b.color }}>{b.status}</span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: b.remaining >= 0 ? 'var(--text2)' : 'var(--danger)' }}>{b.remaining >= 0 ? money(b.remaining) + ' left' : money(-b.remaining) + ' over'}</span>
              </div>
              {b.willExceed && (
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8, fontWeight: 600 }}>
                  At this pace you'll reach {money(b.projected!)} by month-end.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= Goals =================
export function FGoals() {
  const { open } = useStore();
  const { d } = useData();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Savings goals" action={<AddBtn onClick={() => open('goal')} />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.goals.map((g) => (
          <div key={g.id} onClick={() => open('goal', { id: g.id, name: g.name, target: g.target, current: g.current, color: g.color, dueTs: g.dueTs, accId: g.accId ?? null })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '17px 18px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ring pct={g.pct} colorKey={g.color} size={52} stroke={6} />
                <div style={{ position: 'absolute', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{g.pct}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{g.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                  {[g.followsName ? `Follows ${g.followsName}` : null, g.dueTs ? 'Target ' + fmtDate(g.dueTs) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(g.current)}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>of {money(g.target)}</div>
              </div>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${g.pct}%`, background: `var(--${g.color})`, transition: 'width .4s' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Accounts =================
export function FAccounts() {
  const { open } = useStore();
  const { d } = useData();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Accounts" action={<AddBtn onClick={() => open('account')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '18px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>Net worth</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', marginTop: 6 }}>{(d.netWorth < 0 ? '−' : '') + money(Math.round(d.netWorth))}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
          Across {d.accounts.length} {d.accounts.length === 1 ? 'account' : 'accounts'}
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {d.accounts.map((a) => (
          <div key={a.id} onClick={() => open('account', { id: a.id, name: a.name, type: a.type, color: a.color, opening: a.opening })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 44, height: 44, borderRadius: 'calc(13px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" style={{ fill: 'none', stroke: `var(--${a.color})`, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M3 6h14v9H3zM3 9.5h14M6 12.5h3" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                {a.smsBalanceTs != null
                  ? `${a.type} · bank said ${ago(a.smsBalanceTs)}`
                  : (a.smsLinks || []).length
                    ? `${a.type} · from bank messages`
                    : a.type}
              </div>
            </div>
            {/* A credit card's balance is what's owed: negative, and said so. */}
            <div style={{ fontSize: 16, fontWeight: 700, color: a.balance < 0 ? 'var(--danger)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{(a.balance < 0 ? '−' : '') + money(a.balance)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Recurring =================
export function FRecurring() {
  const { state, open, mutate, haptic } = useStore();
  const { d } = useData();
  // Found in what's been paid, not yet set up: one tap each.
  const found = React.useMemo(() => findRecurring(state!), [state]);
  const addFound = (f: FoundRecurring) => {
    haptic();
    mutate(
      () => api.addRecurring({ name: f.name, cat: f.cat, accId: f.accId, amount: f.amount, freq: f.freq, income: f.income, nextTs: f.nextTs }),
      `${f.name} added`
    ).catch(() => {});
  };
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Recurring" action={<AddBtn onClick={() => open('recurring')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Bills a month</span>
        <span style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(Math.round(d.recurringMonthly))}</span>
          {d.recurringIncomeMonthly > 0 && (
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--indigo)', marginTop: 2 }}>+{money(Math.round(d.recurringIncomeMonthly))} coming in</span>
          )}
        </span>
      </div>
      {found.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>Found in your payments</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 18 }}>
            {found.map((f, i) => (
              <div key={f.name + f.income} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 13px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                    {f.income ? 'Comes in' : f.freq} · {money(f.amount)} · paid {f.seen} times · next {fmtDate(f.nextTs)}
                  </div>
                </div>
                <div onClick={() => addFound(f)} role="button" className="press92" style={{ flex: 'none', padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)', cursor: 'pointer' }}>
                  Add
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {d.recurring.map((r) => {
          const fc = fcatByName(state!.fcats, r.cat);
          // What paid it last: the bank's own message, or the schedule. And
          // when it's due but nothing has come in yet, say so rather than
          // writing an entry the bank's message would then repeat.
          const last = state!.txns.filter((t) => t.recurringId === r.id).sort((a, b) => b.ts - a.ts)[0];
          const waiting = r.nextTs != null && r.nextTs < Date.now();
          const status = waiting
            ? 'Due, waiting for your bank'
            : last
              ? `${last.sms ? 'Paid' : 'Added'} ${fmtDate(last.ts)}${last.sms ? ' · from your bank' : ''}`
              : null;
          return (
            <div key={r.id} onClick={() => open('recurring', { id: r.id, name: r.name, cat: r.cat, amount: r.amount, freq: r.freq, accId: r.accId })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color="var(--text2)" size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{r.freq}{r.nextTs && !waiting ? ' · next ' + fmtDate(r.nextTs) : ''}</div>
                {status && <div style={{ fontSize: 12, color: waiting ? 'var(--indigo)' : 'var(--text3)', marginTop: 2 }}>{status}</div>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= Categories management =================
export function FCats() {
  const { state, open } = useStore();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Categories" action={<AddBtn onClick={() => open('fcat')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {state!.fcats.map((c) => (
          <div key={c.id} onClick={() => open('fcat', { id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 40, height: 40, borderRadius: 'calc(12px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={c.icon} color="var(--text2)" size={20} /></span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{c.kind === 'income' ? 'Income' : 'Expense'}</span>
            <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.7 }}><path d="M11 3l2.5 2.5L6 13l-3 .8.8-3L11 3Z" /></svg>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Insights =================
export function FInsights() {
  const { d } = useData();
  const sd = d.spentThisMonth - d.spentPrevMonth;
  const pctd = d.spentPrevMonth > 0 ? Math.round((sd / d.spentPrevMonth) * 100) : 0;
  const netNow = d.incThisMonth - d.spentThisMonth;
  const overB = d.budgets.filter((b) => b.pct >= 100);
  const cards: { text: string; good: boolean | null }[] = [
    { text: sd <= 0 ? `You spent ${money(-sd)} less than last month${d.spentPrevMonth > 0 ? ' (' + Math.abs(pctd) + '% down)' : ''}.` : `You spent ${money(sd)} more than last month${d.spentPrevMonth > 0 ? ' (' + pctd + '% up)' : ''}.`, good: sd <= 0 },
    { text: netNow >= 0 ? `You're net positive by ${money(netNow)} this month.` : `You're spending ${money(-netNow)} more than you earn this month.`, good: netNow >= 0 },
  ];
  if (d.topCatArr.length) cards.push({ text: `${d.topCatArr[0].cat} is your biggest expense at ${money(d.topCatArr[0].val)}.`, good: null });
  if (overB.length) cards.push({ text: `${overB.length} budget${overB.length > 1 ? 's are' : ' is'} over the limit: ${overB.map((b) => b.cat).join(', ')}.`, good: false });
  else if (d.budgets.length) cards.push({ text: `All ${d.budgets.length} budgets are on track this month.`, good: true });

  const mx = Math.max(d.spentPrevMonth, d.spentThisMonth, 1);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Insights" />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 16 }}>Spending vs last month</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 120 }}>
          {([['Last', d.spentPrevMonth, 'var(--border)'], ['This', d.spentThisMonth, 'var(--indigo)']] as const).map(([lab, val, col]) => (
            <div key={lab} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(val)}</div>
              <div style={{ width: '100%', maxWidth: 64, height: (val / mx) * 84, minHeight: 4, borderRadius: 'calc(10px * var(--sq)) calc(10px * var(--sq)) 0 0', background: col }} />
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{lab} month</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Income this month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--indigo)', marginTop: 3 }}>{money(d.incThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>was {money(d.incPrevMonth)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Spent this month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{money(d.spentThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>was {money(d.spentPrevMonth)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px', display: 'flex', gap: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', marginTop: 7, background: c.good === true ? 'var(--indigo)' : c.good === false ? 'var(--danger)' : 'var(--text2)' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.5 }}>{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
