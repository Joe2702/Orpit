import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { ago, money, fmtDate, relLabel, moneySymbol, listSep, fmtClock } from '../lib/format';
import { FinIcon } from '../lib/iconPaths';
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
import { TxnRow, fcatByName } from './TxnRow';
import { inFocus, type TxnFocus } from '../lib/txnFocus';
import { t, tData, tn } from '../i18n';

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


function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <div tabIndex={0} onClick={onClick} className="press92" role="button" aria-label={t('Add')} style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
          title: t('Already added from your bank?'),
          message: t('{name} · {amount} · {n} at {v} came in from your bank messages today. Add this one as well?', { name: seen.name, amount: money(seen.amount), n: state!.accounts.find((a) => a.id === seen.accId)?.name || t('imported'), v: fmtClock(new Date(seen.ts).getHours() + new Date(seen.ts).getMinutes() / 60) }),
          confirmLabel: t('Add anyway'),
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
      ? `${fromAcc?.name || t('Account')} → ${toAcc?.name || t('Account')}`
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
      edit ? t('Transaction updated') : t('Transaction saved')
    ).catch(() => {});
    go('ftxns', screenData?.back ?? null);

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
          title: t('Move all {name} payments?', { name }),
          message: tn(
            others.length,
            '{n} other payment from {name} is filed elsewhere. Put it under {cat} too? New ones will follow.',
            '{n} other payments from {name} are filed elsewhere. Put them under {cat} too? New ones will follow.',
            { name, cat: tData(cat) }
          ),
          confirmLabel: t('Move all'),
        });
        if (ok) {
          const ids = others.map((t) => t.id);
          mutateOpt(
            (s) => ({ ...s, txns: s.txns.map((t) => (ids.includes(t.id) ? { ...t, cat, review: false, auto: false } : t)) }),
            () => api.recategorise(ids, cat),
            t('{n} {name} payments under {cat}', { n: others.length + 1, name, cat })
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
      t('Transaction deleted')
    ).catch(() => {});
    go('ftxns', screenData?.back ?? null);
  };

  // Same 44px floor as the range tabs: three targets now share this row, so
  // each is narrower than before and an under-height one is easier to miss.
  const tab = (active: boolean, color: string): React.CSSProperties => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 'calc(11px * var(--sq))', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(active ? { background: 'var(--surface)', color, boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) });
  const catList = fcats.filter((c) => c.kind === kind);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={edit ? (isTransfer ? t('Edit transfer') : t('Edit transaction')) : t('Add transaction')} />
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 20 }}>
        <div role="button" tabIndex={0} onClick={() => setKind('expense')} style={tab(kind === 'expense', 'var(--text)')}>{t('Expense')}</div>
        <div role="button" tabIndex={0} onClick={() => setKind('income')} style={tab(income, 'var(--indigo)')}>{t('Income')}</div>
        <div role="button" tabIndex={0} onClick={() => setKind('transfer')} style={tab(isTransfer, 'var(--indigo)')}>{t('Transfer')}</div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--text2)', verticalAlign: 'top', lineHeight: 1.7 }}>{moneySymbol().trim()}</span>
        <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-.03em', color: income ? 'var(--indigo)' : isTransfer ? 'var(--indigo)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{amount === '' ? '0' : amount}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 22 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <div role="button" tabIndex={0} aria-label={k === 'del' ? t('Delete digit') : k === '.' ? t('Decimal point') : k} key={k} onClick={() => press(k)} style={{ height: 50, borderRadius: 'calc(14px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', background: 'var(--bg)' }}>
            {k === 'del' ? <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M9 5h10v14H9l-6-7 6-7ZM13 9.5l4 5M17 9.5l-4 5" /></svg> : k}
          </div>
        ))}
      </div>
      {/* A transfer has no category: it isn't spending, so there is nothing to
          categorise. Showing an inert grid would only invite a wrong answer. */}
      {!isTransfer && <>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>{t('Category')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 9, marginBottom: 22 }}>
        {catList.map((c) => {
          const active = cat === c.name;
          return (
            <div role="button" tabIndex={0} key={c.id} onClick={() => (income ? setIncCat(c.name) : setExCat(c.name))} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 'calc(16px * var(--sq))', cursor: 'pointer', transition: 'all .15s', border: `1px solid ${active ? `var(--${c.color})` : 'var(--border)'}`, background: active ? `var(--${c.color})` : 'var(--surface)' }}>
              <FinIcon icon={c.icon} color={active ? '#fff' : `var(--${c.color})`} size={22} />
              <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : 'var(--text)' }}>{tData(c.name)}</span>
            </div>
          );
        })}
      </div>
      {kind === 'expense' && (edit ? isRefund(edit) || edit.sms : false) && (
        <div tabIndex={0} onClick={() => setRefund((v) => !v)} role="switch" aria-checked={refund} className="press99" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -8, marginBottom: 22, cursor: 'pointer' }}>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>
            {t('Money back (a refund)')}
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{t('Takes it off your spending instead of counting as income')}</span>
          </span>
          <span style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', background: refund ? 'var(--indigo)' : 'var(--surface2)', border: '1px solid var(--border)', position: 'relative', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 2, insetInlineStart: refund ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'inset-inline-start .2s' }} />
          </span>
        </div>
      )}
      </>}
      {edit?.sms && (
        // What the entry was read from, so a strange name or amount can be
        // checked against the bank's own words. The text lives on this phone
        // only; another device, or one that was reset, won't have it.
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 14px', marginBottom: 22 }}>
          <div tabIndex={0} onClick={() => source && setShowSource((v) => !v)} role={source ? 'button' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: source ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
              {source ? t('From {sender} · {date}', { sender: source.sender, date: fmtDate(source.ts) }) : t('Read from a bank message')}
            </span>
            {source && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)' }}>{showSource ? t('Hide') : t('Show message')}</span>}
          </div>
          {!source && (
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 4 }}>
              {t('The message itself stays on the phone that read it, and isn’t on this one.')}
            </div>
          )}
          {source && showSource && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[source, ...(source.more || [])].map((m, i) => (
                <div key={i} dir="auto" style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface2)', borderRadius: 'calc(12px * var(--sq))', padding: '9px 11px', overflowWrap: 'anywhere' }}>
                  {i > 0 && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 3 }}>{t('Also from {sender}', { sender: m.sender })}</div>}
                  {m.body}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{isTransfer ? t('From') : t('Account')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
        {accounts.map((a) => (
          <div role="button" tabIndex={0} aria-pressed={accId === a.id} key={a.id} onClick={() => pickFrom(a.id)} style={chip(accId === a.id, `var(--${a.color})`)}>{tData(a.name)}</div>
        ))}
      </div>
      {isTransfer && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('To')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 10 }}>
            {accounts.filter((a) => a.id !== accId).map((a) => (
              <div role="button" tabIndex={0} aria-pressed={toAccId === a.id} key={a.id} onClick={() => pickTo(a.id)} style={chip(toAccId === a.id, `var(--${a.color})`)}>{tData(a.name)}</div>
            ))}
          </div>
          {/* The one thing worth saying about transfers, said once, where the
              question actually arises. */}
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 22 }}>
            {accounts.length < 2
              ? t('Add a second account first. A transfer needs somewhere to go.')
              : t('Moves money between your own accounts. It won\'t count as spending or income.')}
          </div>
        </>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('Date')}</div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 14px', fontSize: 15, fontWeight: 600, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('Note')}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional note')} style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      {!isTransfer && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('Receipt')}</div>
          <div style={{ marginBottom: 22 }}>
            {edit ? <ReceiptField txn={edit} /> : <ReceiptPicker value={newPhoto} onChange={setNewPhoto} />}
          </div>
        </>
      )}
      {/* 92 clears the tab bar, which overlays the bottom of the scroll area. */}
      <StickySave
        label={isTransfer ? t('Save transfer') : t('Save transaction')}
        onClick={save}
        enabled={transferOk}
        bottom={92}
      />
      {edit && (
        <div role="button" tabIndex={0} onClick={del} className="press99" style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />{t('Delete transaction')}
        </div>
      )}
    </div>
  );
}

// ================= Transactions list (grouped, search, filter) =================
export function FTxns() {
  const { state, go, screenData } = useStore();
  const { remove } = useEntryActions();
  const fcats = state!.fcats;
  const accById = Object.fromEntries(state!.accounts.map((a) => [a.id, a]));
  const [q, setQ] = useState('');
  // Opened from a chart: only the spending behind what was tapped.
  const [focus, setFocus] = useState<TxnFocus | null>(screenData?.focus ?? null);
  const [fcat, setFcat] = useState<string>(screenData?.cat ?? 'All');
  const [facc, setFacc] = useState('All');
  const catRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A category chosen from a chart may be far along the row.
    catRow.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  const [shown, setShown] = useState(80);
  const matched = [...state!.txns]
    .sort((a, b) => b.ts - a.ts)
    .filter((t) => {
      const ql = q.toLowerCase();
      if (ql && !(t.name.toLowerCase().includes(ql) || t.cat.toLowerCase().includes(ql) || (t.note || '').toLowerCase().includes(ql))) return false;
      if (fcat !== 'All' && t.cat !== fcat) return false;
      if (facc !== 'All' && accById[t.accId || '']?.name !== facc) return false;
      if (focus && !inFocus(focus, t)) return false;
      return true;
    });
  const back = { focus, cat: fcat };
  const focusTotal = focus ? matched.reduce((s, t) => s - t.amount, 0) : 0;
  const focusCount = focus ? matched.filter((t) => t.amount < 0).length : 0;
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
      <Header title={t('Transactions')} action={<AddBtn onClick={() => go('faddtx')} />} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '0 14px', height: 48, marginBottom: 14 }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l3 3" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search transactions')} style={{ flex: 1, border: 'none', background: 'none', fontSize: 15, color: 'var(--text)', outline: 'none' }} />
      </div>
      {focus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', boxShadow: 'var(--shadow)', padding: '12px 10px 12px 16px', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fcat !== 'All' ? t('Spent on {cat}', { cat: tData(fcat) }) : t('Spent')} · {focus.title}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', marginTop: 2 }}>
              {money(focusTotal)}
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0, color: 'var(--text2)' }}> · {tn(focusCount, '{n} payment', '{n} payments')}</span>
            </div>
          </div>
          <button
            onClick={() => setFocus(null)}
            aria-label={t('Show all transactions')}
            className="press92"
            style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="14" height="14" aria-hidden style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M3 3l8 8M11 3l-8 8" /></svg>
          </button>
        </div>
      )}
      <div ref={catRow} style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 9, paddingBottom: 2 }}>
        {['All', ...fcats.map((c) => c.name)].map((c) => (
          <div role="button" tabIndex={0} aria-pressed={fcat === c} key={c} onClick={() => setFcat(c)} style={{ ...chip(fcat === c, 'var(--indigo)'), flex: 'none' }}>{c === 'All' ? t('All categories') : tData(c)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
        {['All', ...state!.accounts.map((a) => a.name)].map((a) => (
          <div role="button" tabIndex={0} aria-pressed={facc === a} key={a} onClick={() => setFacc(a)} style={{ ...chip(facc === a, 'var(--indigo)'), flex: 'none' }}>{a === 'All' ? t('All accounts') : tData(a)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 9, paddingInlineStart: 2 }}>{g.label}</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              {g.items.map((t) => {
                return (
                  <SwipeRow key={t.id} onEdit={() => go('faddtx', { edit: t, back })} onDelete={() => remove('txn', t)}>
                    <TxnRow t={t} onClick={() => go('faddtx', { edit: t, back })} />
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {matched.length > shown && (
        <div tabIndex={0} onClick={() => setShown(shown + 80)} className="press99" role="button" style={{ marginTop: 16, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          {t('Show older · {n} more', { n: matched.length - shown })}</div>
      )}
      {matched.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>
          {focus ? t('Nothing left here. Close the filter above to see everything.') : t('No transactions match your search.')}
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
  const accName = (id: string | null) => state!.accounts.find((a) => a.id === id)?.name || t('an account');
  // A possible transfer is asked about once, on its money-out half.
  const items = [...state!.txns]
    .filter((t) => {
      if (!t.review) return false;
      const other = t.pairKey ? byKey.get(t.pairKey) : undefined;
      return !(other && other.review && !other.toAccId && t.amount > 0 && other.amount < 0);
    })
    .sort((a, b) => b.ts - a.ts);

  const answerSame = (tx: Txn, same: boolean) => {
    haptic();
    mutate(() => api.answerSame(tx.id, same), same ? t('Kept one, with your category') : t('Kept both')).catch(() => {});
  };
  const pair = (tx: Txn, other: Txn) => {
    haptic();
    mutate(() => api.pairTxns(tx.id, other.id), t('Made it one transfer')).catch(() => {});
  };

  // One shop's payments travel together: filing one Talabat order under
  // Eating out files the rest that the import guessed at, but never one the
  // user already chose a category for.
  const sameShop = (t: Txn) => {
    const k = merchantKey(t.name);
    return state!.txns.filter((x) => x.id === t.id || (k && !x.toAccId && !x.adjust && x.income === t.income && (x.auto || x.review) && merchantKey(x.name) === k));
  };

  const setCat = (tx: Txn, cat: string) => {
    haptic();
    const ids = sameShop(tx).map((x) => x.id);
    const others = ids.length - 1;
    mutateOpt(
      (s) => ({ ...s, txns: s.txns.map((x) => (ids.includes(x.id) ? { ...x, cat, review: false, auto: false } : x)) }),
      () => api.recategorise(ids, cat),
      others > 0 ? t('{name} → {cat}, and {others} more like it', { name: tx.name, cat, others }) : t('Filed under {cat}', { cat })
    ).catch(() => {});
  };
  const looksRight = (ids: string[]) => {
    haptic();
    mutateOpt(
      (s) => ({ ...s, txns: s.txns.map((x) => (ids.includes(x.id) ? { ...x, review: false } : x)) }),
      () => api.markReviewed(ids),
      ids.length > 1 ? t('All marked as checked') : undefined
    ).catch(() => {});
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={t('To review')} />
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)', marginBottom: 6 }}>{t('All checked')}</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55 }}>
            {t('When Orbit isn’t sure what a payment from your bank was, it will wait here for you.')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              {t('Read from your bank messages. Pick what each one was, and Orbit remembers the shop.')}
            </div>
            {items.length > 1 && (
              <div tabIndex={0} onClick={() => looksRight(items.map((t) => t.id))} role="button" className="press99" style={{ flex: 'none', fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)', cursor: 'pointer', padding: '8px 2px' }}>
                {t('All fine')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((tx) => {
              const text = smsText(tx.smsKey);
              const typed = tx.dupOf ? byId.get(tx.dupOf) : undefined;
              const half = tx.pairKey ? byKey.get(tx.pairKey) : undefined;
              const halfOpen = half && !half.toAccId;
              // The current guess first, so it's visible without scrolling.
              const cats = fcats
                .filter((c) => c.kind === (tx.income ? 'income' : 'expense'))
                .sort((a, b) => Number(b.name === tx.cat) - Number(a.name === tx.cat));
              const acc = state!.accounts.find((a) => a.id === tx.accId)?.name;
              return (
                <div key={tx.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{(tx.amount >= 0 ? '+' : '−') + money(tx.amount)}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                    {[relLabel(tx.ts), acc, tx.note].filter(Boolean).join(' · ')}
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
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)' }}>{t('Did you also add this by hand?')}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>
                        {[typed.name !== typed.cat ? typed.name : null, typed.cat, accName(typed.accId), (typed.amount >= 0 ? '+' : '−') + money(typed.amount), relLabel(typed.ts), typed.note]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <div tabIndex={0} onClick={() => answerSame(tx, true)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}>
                          {t('Same payment')}
                        </div>
                        <div tabIndex={0} onClick={() => answerSame(tx, false)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          {t('Two payments')}
                        </div>
                      </div>
                    </div>
                  )}
                  {half && halfOpen && (
                    // Money out of one account and the same amount into
                    // another, close together, with nothing in either message
                    // to prove both accounts are the user's.
                    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '11px 12px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)' }}>{t('Moving your own money?')}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>
                        {tx.amount < 0 ? `${accName(tx.accId)} → ${accName(half.accId)}` : `${accName(half.accId)} → ${accName(tx.accId)}`}
                        {' · '}
                        {tx.amount < 0
                          ? t('{amount} arrived {when}', { amount: money(Math.abs(half.amount)), when: relLabel(half.ts).toLowerCase() })
                          : t('{amount} left {when}', { amount: money(Math.abs(half.amount)), when: relLabel(half.ts).toLowerCase() })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <div tabIndex={0} onClick={() => pair(tx, half)} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}>
                          {t('Yes, a transfer')}
                        </div>
                        <div tabIndex={0} onClick={() => looksRight([tx.id, half.id])} role="button" className="press99" style={{ flex: 1, height: 40, borderRadius: 'calc(11px * var(--sq))', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          {t('No, separate')}
                        </div>
                      </div>
                    </div>
                  )}
                  {!(half && halfOpen) && (
                  <div style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '12px -16px 0', padding: '0 16px 2px' }}>
                    {cats.map((c) => (
                      <div role="button" tabIndex={0} aria-pressed={tx.cat === c.name} key={c.id} onClick={() => setCat(tx, c.name)} className="press99" style={{ ...chip(tx.cat === c.name, 'var(--indigo)'), flex: 'none' }}>
                        {tData(c.name)}
                      </div>
                    ))}
                  </div>
                  )}
                  {/* A question above answers this card on its own; a third
                      button beside it would only ask which one to press. */}
                  {!typed && !(half && halfOpen) && (
                    <div tabIndex={0} onClick={() => looksRight([tx.id])} role="button" className="press99" style={{ marginTop: 12, height: 42, borderRadius: 'calc(12px * var(--sq))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                      {t('{cat} is right', { cat: tData(tx.cat) })}</div>
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
      <Header title={t('Budgets')} action={<AddBtn onClick={() => open('budget', { cat: state!.fcats.find((c) => c.kind === 'expense')?.name || 'Food' })} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{t('This month')}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('{amount} of {amount2}', { amount: money(d.budgetSpent), amount2: money(d.budgetTotal) })}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'var(--indigo)', width: `${totalPct}%` }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.budgets.map((b) => {
          const fc = fcatByName(state!.fcats, b.cat);
          return (
            <div role="button" tabIndex={0} key={b.id} onClick={() => open('budget', { id: b.id, cat: b.cat, limit: b.limit, rollover: b.rollover })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <span style={{ width: 34, height: 34, borderRadius: 'calc(10px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color="var(--text2)" size={18} /></span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tData(b.cat)}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(b.spent)} / {money(b.effLimit)}</span>
              </div>
              {b.carried > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--indigo)', marginTop: -6, marginBottom: 8 }}>
                  {t('+{amount} rolled over from last month', { amount: money(b.carried) })}</div>
              )}
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, b.pct)}%`, background: b.color, transition: 'width .4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>
                  {t('{n}% used', { n: b.pct })} · <span style={{ color: b.color }}>{b.status}</span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: b.remaining >= 0 ? 'var(--text2)' : 'var(--danger)' }}>{b.remaining >= 0 ? t('{amount} left', { amount: money(b.remaining) }) : t('{amount} over', { amount: money(-b.remaining) })}</span>
              </div>
              {b.willExceed && (
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8, fontWeight: 600 }}>
                  {t('At this pace you\'ll reach {amount} by month-end.', { amount: money(b.projected!) })}</div>
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
      <Header title={t('Savings goals')} action={<AddBtn onClick={() => open('goal')} />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.goals.map((g) => (
          <div role="button" tabIndex={0} key={g.id} onClick={() => open('goal', { id: g.id, name: g.name, target: g.target, current: g.current, color: g.color, dueTs: g.dueTs, accId: g.accId ?? null })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '17px 18px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ring pct={g.pct} colorKey={g.color} size={52} stroke={6} />
                <div style={{ position: 'absolute', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{g.pct}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{g.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                  {[g.followsName ? t('Follows {name}', { name: g.followsName }) : null, g.dueTs ? t('Target {date}', { date: fmtDate(g.dueTs) }) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'end', flex: 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(g.current)}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('of {amount}', { amount: money(g.target) })}</div>
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
      <Header title={t('Accounts')} action={<AddBtn onClick={() => open('account')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '18px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{t('Net worth')}</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', marginTop: 6 }}>{(d.netWorth < 0 ? '−' : '') + money(Math.round(d.netWorth))}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
          {tn(d.accounts.length, 'Across {n} account', 'Across {n} accounts')}
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {d.accounts.map((a) => (
          <div role="button" tabIndex={0} key={a.id} onClick={() => open('account', { id: a.id, name: a.name, type: a.type, color: a.color, opening: a.opening })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 44, height: 44, borderRadius: 'calc(13px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" style={{ fill: 'none', stroke: `var(--${a.color})`, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M3 6h14v9H3zM3 9.5h14M6 12.5h3" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tData(a.name)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                {a.smsBalanceTs != null
                  ? t('{type} · bank said {date}', { type: a.type, date: ago(a.smsBalanceTs) })
                  : (a.smsLinks || []).length
                    ? t('{type} · from bank messages', { type: a.type })
                    : tData(a.type)}
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
      t('{name} added', { name: f.name })
    ).catch(() => {});
  };
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={t('Recurring')} action={<AddBtn onClick={() => open('recurring')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{t('Bills a month')}</span>
        <span style={{ textAlign: 'end' }}>
          <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(Math.round(d.recurringMonthly))}</span>
          {d.recurringIncomeMonthly > 0 && (
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--indigo)', marginTop: 2 }}>{t('+{amount} coming in', { amount: money(Math.round(d.recurringIncomeMonthly)) })}</span>
          )}
        </span>
      </div>
      {found.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>{t('Found in your payments')}</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 18 }}>
            {found.map((f, i) => (
              <div key={f.name + f.income} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 13px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                    {f.income ? t('Comes in') : tData(f.freq)} · {money(f.amount)} · {tn(f.seen, 'paid {n} time', 'paid {n} times')} · {t('next {date}', { date: fmtDate(f.nextTs) })}
                  </div>
                </div>
                <div tabIndex={0} onClick={() => addFound(f)} role="button" className="press92" style={{ flex: 'none', padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)', cursor: 'pointer' }}>
                  {t('Add')}
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
            ? t('Due, waiting for your bank')
            : last
              ? last.sms
                ? t('Paid {date} · from your bank', { date: fmtDate(last.ts) })
                : t('Added {date}', { date: fmtDate(last.ts) })
              : null;
          return (
            <div role="button" tabIndex={0} key={r.id} onClick={() => open('recurring', { id: r.id, name: r.name, cat: r.cat, amount: r.amount, freq: r.freq, accId: r.accId })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color="var(--text2)" size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{tData(r.freq)}{r.nextTs && !waiting ? ' · ' + t('next {date}', { date: fmtDate(r.nextTs) }) : ''}</div>
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
      <Header title={t('Categories')} action={<AddBtn onClick={() => open('fcat')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {state!.fcats.map((c) => (
          <div role="button" tabIndex={0} key={c.id} onClick={() => open('fcat', { id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 40, height: 40, borderRadius: 'calc(12px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={c.icon} color="var(--text2)" size={20} /></span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tData(c.name)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{c.kind === 'income' ? t('Income') : t('Expense')}</span>
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
    {
      text:
        sd <= 0
          ? d.spentPrevMonth > 0
            ? t('You spent {amount} less than last month ({n}% down).', { amount: money(-sd), n: Math.abs(pctd) })
            : t('You spent {amount} less than last month.', { amount: money(-sd) })
          : d.spentPrevMonth > 0
            ? t('You spent {amount} more than last month ({n}% up).', { amount: money(sd), n: pctd })
            : t('You spent {amount} more than last month.', { amount: money(sd) }),
      good: sd <= 0,
    },
    { text: netNow >= 0 ? t('You\'re net positive by {amount} this month.', { amount: money(netNow) }) : t('You\'re spending {amount} more than you earn this month.', { amount: money(-netNow) }), good: netNow >= 0 },
  ];
  if (d.topCatArr.length) cards.push({ text: t('{cat} is your biggest expense at {amount}.', { cat: d.topCatArr[0].cat, amount: money(d.topCatArr[0].val) }), good: null });
  if (overB.length) cards.push({ text: tn(overB.length, '{n} budget is over the limit: {cats}.', '{n} budgets are over the limit: {cats}.', { cats: overB.map((b) => tData(b.cat)).join(listSep()) }), good: false });
  else if (d.budgets.length) cards.push({ text: t('All {n} budgets are on track this month.', { n: d.budgets.length }), good: true });

  const mx = Math.max(d.spentPrevMonth, d.spentThisMonth, 1);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={t('Insights')} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 16 }}>{t('Spending vs last month')}</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 120 }}>
          {([[t('Last month'), d.spentPrevMonth, 'var(--border)'], [t('This month'), d.spentThisMonth, 'var(--indigo)']] as const).map(([lab, val, col]) => (
            <div key={lab} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(val)}</div>
              <div style={{ width: '100%', maxWidth: 64, height: (val / mx) * 84, minHeight: 4, borderRadius: 'calc(10px * var(--sq)) calc(10px * var(--sq)) 0 0', background: col }} />
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{lab}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Income this month')}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--indigo)', marginTop: 3 }}>{money(d.incThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{t('was {amount}', { amount: money(d.incPrevMonth) })}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Spent this month')}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{money(d.spentThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{t('was {amount}', { amount: money(d.spentPrevMonth) })}</div>
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
