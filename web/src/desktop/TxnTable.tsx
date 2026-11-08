import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { dayKey, fmtDate, money, money0 } from '../lib/format';
import { isIncome, isSpend } from '../lib/money';
import { inFocus, type TxnFocus } from '../lib/txnFocus';
import { FinIcon, guessFinIcon } from '../lib/iconPaths';
import { date, t, tData, tn } from '../i18n';
import { downloadCsv, toCsv } from '../lib/csv';
import type { Txn } from '../types';
import { DIcon } from './nav';
import { exportCsv, txnRows } from './exports';

// Transactions on the website: a real table. Search and filters across the
// top, columns to sort by, rows to tick for doing several at once, and the
// rows you're looking at as a spreadsheet.

type Kind = 'all' | 'spend' | 'income' | 'transfer';
type When = 'all' | 'month' | 'last' | '3m' | 'year';
type SortKey = 'ts' | 'name' | 'cat' | 'amount';

const PAGE = 100;

function whenRange(w: When, now = Date.now()): [number, number] {
  const d = new Date(now);
  const m0 = (k: number) => new Date(d.getFullYear(), d.getMonth() - k, 1).getTime();
  if (w === 'month') return [m0(0), Infinity];
  if (w === 'last') return [m0(1), m0(0)];
  if (w === '3m') return [m0(2), Infinity];
  if (w === 'year') return [new Date(d.getFullYear(), 0, 1).getTime(), Infinity];
  return [-Infinity, Infinity];
}

function Box({ on, partial, onClick, label }: { on: boolean; partial?: boolean; onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <span role="checkbox" aria-checked={partial ? 'mixed' : on} aria-label={label} tabIndex={0} className={`desk-check${on || partial ? ' on' : ''}`} onClick={onClick} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onClick(e as unknown as React.MouseEvent))}>
      {on && (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
      )}
      {partial && !on && <span style={{ width: 8, height: 2, borderRadius: 1, background: 'currentColor' }} />}
    </span>
  );
}

export function TxnTable() {
  const { state, go, screenData, mutateOpt, confirm, showToast } = useStore();
  const s = state!;
  const accName = useMemo(() => Object.fromEntries(s.accounts.map((a) => [a.id, a.name])), [s.accounts]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [cat, setCat] = useState<string>(screenData?.cat && screenData.cat !== 'All' ? screenData.cat : 'all');
  const [acc, setAcc] = useState('all');
  const [when, setWhen] = useState<When>('all');
  const [review, setReview] = useState(false);
  const [focus, setFocus] = useState<TxnFocus | null>(screenData?.focus ?? null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'ts', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);

  const cats = useMemo(() => [...new Set([...s.fcats.map((c) => c.name), ...s.txns.map((x) => x.cat)])].filter(Boolean).sort((a, b) => tData(a).localeCompare(tData(b))), [s.fcats, s.txns]);
  const fcat = (name: string) => s.fcats.find((c) => c.name === name) || guessFinIcon(name);
  const reviewN = s.txns.filter((x) => x.review).length;

  const rows = useMemo(() => {
    const [from, to] = whenRange(when);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = s.txns.filter((x) => {
      if (x.ts < from || x.ts >= to) return false;
      if (kind === 'spend' && !(isSpend(x) && !x.toAccId && !x.adjust)) return false;
      if (kind === 'income' && !isIncome(x)) return false;
      if (kind === 'transfer' && !x.toAccId) return false;
      if (cat !== 'all' && x.cat !== cat) return false;
      if (acc !== 'all' && x.accId !== acc && x.toAccId !== acc) return false;
      if (review && !x.review) return false;
      if (focus && !inFocus(focus, x)) return false;
      if (words.length) {
        const hay = `${x.name} ${x.cat} ${tData(x.cat)} ${x.note || ''} ${accName[x.accId || ''] || ''} ${Math.abs(x.amount)}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const k = sort.key;
    out.sort((a, b) => {
      const v = k === 'ts' ? a.ts - b.ts : k === 'amount' ? a.amount - b.amount : k === 'name' ? a.name.localeCompare(b.name) : tData(a.cat).localeCompare(tData(b.cat));
      return (v || b.ts - a.ts) * sort.dir;
    });
    return out;
  }, [s.txns, q, kind, cat, acc, when, review, focus, sort, accName]);

  const counted = rows.filter((x) => !x.toAccId && !x.adjust);
  const spent = counted.filter(isSpend).reduce((a, x) => a - x.amount, 0);
  const earned = counted.filter(isIncome).reduce((a, x) => a + x.amount, 0);
  const page = rows.slice(0, shown);
  const selRows = rows.filter((x) => sel.has(x.id));
  const allOn = rows.length > 0 && selRows.length === rows.length;
  const someOn = selRows.length > 0 && !allOn;
  const filtered = !!(q || kind !== 'all' || cat !== 'all' || acc !== 'all' || when !== 'all' || review || focus);

  const toggle = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clear = () => setSel(new Set());
  const back = { focus, cat: cat === 'all' ? 'All' : cat };

  // ---- Several at once ----
  const pending = selRows.some((x) => x.id.startsWith('tmp-'));
  const guard = () => {
    if (!pending) return false;
    showToast(t('Some of these are still saving. Try again in a moment.'));
    return true;
  };
  const recat = (to: string) => {
    if (!to || guard()) return;
    const ids = selRows.filter((x) => !x.toAccId && !x.adjust).map((x) => x.id);
    if (!ids.length) return;
    mutateOpt(
      (st) => ({ ...st, txns: st.txns.map((x) => (ids.includes(x.id) ? { ...x, cat: to, review: false, auto: false } : x)) }),
      () => api.recategorise(ids, to),
      tn(ids.length, 'Moved {n} entry to {cat}', 'Moved {n} entries to {cat}', { cat: tData(to) })
    ).catch(() => {});
    clear();
  };
  const markChecked = () => {
    if (guard()) return;
    const ids = selRows.filter((x) => x.review).map((x) => x.id);
    if (!ids.length) return;
    mutateOpt((st) => ({ ...st, txns: st.txns.map((x) => (ids.includes(x.id) ? { ...x, review: false } : x)) }), () => api.markReviewed(ids), tn(ids.length, '{n} entry checked', '{n} entries checked')).catch(() => {});
    clear();
  };
  const remove = async () => {
    if (guard()) return;
    const ids = selRows.map((x) => x.id);
    const ok = await confirm({
      title: tn(ids.length, 'Delete {n} entry?', 'Delete {n} entries?'),
      message: t('They come off every total and balance. Payments read from bank messages stay deleted, even if the message is read again.'),
      confirmLabel: t('Delete'),
    });
    if (!ok) return;
    const set = new Set(ids);
    mutateOpt((st) => ({ ...st, txns: st.txns.filter((x) => !set.has(x.id)) }), () => api.deleteTxns(ids), tn(ids.length, '{n} entry deleted', '{n} entries deleted')).catch(() => {});
    clear();
  };
  const exportView = async () => {
    // Nothing narrowed down: the whole history, from the server.
    if (!selRows.length && !filtered) {
      const n = await exportCsv('txns', s);
      showToast(tn(n, '{n} row saved as a spreadsheet', '{n} rows saved as a spreadsheet'));
      return;
    }
    const { header, rows: r } = txnRows(selRows.length ? selRows : rows, s.accounts);
    downloadCsv(`orbit-transactions-${dayKey()}.csv`, toCsv(header, r));
    showToast(tn(r.length, '{n} row saved as a spreadsheet', '{n} rows saved as a spreadsheet'));
  };

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`sortable ${cls}`} onClick={() => setSort((cur) => ({ key, dir: cur.key === key ? (-cur.dir as 1 | -1) : key === 'ts' || key === 'amount' ? -1 : 1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {sort.key === key && (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', transform: sort.dir === 1 ? 'rotate(180deg)' : undefined }}>
            <path d="M2 3.5l3 3 3-3" />
          </svg>
        )}
      </span>
    </th>
  );

  const sel_ = (value: string, set: (v: string) => void, opts: [string, string][], label: string) => (
    <select className="desk-select" value={value} onChange={(e) => (set(e.target.value), setShown(PAGE))} aria-label={label}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ paddingTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="display" style={{ fontSize: 44, lineHeight: 1.05, color: 'var(--text)' }}>{t('Transactions')}</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {tn(rows.length, '{n} entry', '{n} entries')} · {t('{amount} out', { amount: money0(spent) })} · {t('{amount} in', { amount: money0(earned) })}
          </div>
        </div>
        <button className="desk-btn" onClick={exportView} disabled={!rows.length}>
          <DIcon name="download" size={16} />
          {selRows.length ? t('Export selected') : filtered ? t('Export these') : t('Export CSV')}
        </button>
        <button className="desk-btn primary" onClick={() => go('faddtx')}>
          <DIcon name="plus" size={16} sw={2.3} />
          {t('Add')}
        </button>
      </div>

      {focus && (
        <div className="desk-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 14 }}>
          <DIcon name="finsights" size={18} style={{ color: 'var(--indigo)' }} />
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>
            {cat !== 'all' ? t('Spent on {cat}', { cat: tData(cat) }) : t('Spent')} · {focus.title}
          </span>
          <button className="desk-link" onClick={() => setFocus(null)}>
            {t('Show all transactions')}
          </button>
        </div>
      )}

      {/* Filters, in one row above the table. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <DIcon name="search" size={16} style={{ position: 'absolute', insetInlineStart: 11, top: 10, color: 'var(--text3)' }} />
          <input className="desk-input" value={q} onChange={(e) => (setQ(e.target.value), setShown(PAGE))} placeholder={t('Search name, category, note or amount')} style={{ width: '100%', paddingInlineStart: 34 }} aria-label={t('Search transactions')} />
        </div>
        {sel_(when, (v) => setWhen(v as When), [['all', t('All time')], ['month', t('This month')], ['last', t('Last month')], ['3m', t('Last 3 months')], ['year', t('This year')]], t('When'))}
        {sel_(kind, (v) => setKind(v as Kind), [['all', t('Everything')], ['spend', t('Spending')], ['income', t('Income')], ['transfer', t('Transfers')]], t('Type'))}
        {sel_(cat, setCat, [['all', t('All categories')], ...cats.map((c) => [c, tData(c)] as [string, string])], t('Category'))}
        {s.accounts.length > 1 && sel_(acc, setAcc, [['all', t('All accounts')], ...s.accounts.map((a) => [a.id, tData(a.name)] as [string, string])], t('Account'))}
        {reviewN > 0 && (
          <div className="desk-chip" role="button" tabIndex={0} aria-pressed={review} onClick={() => setReview(!review)} style={review ? { borderColor: 'var(--indigo)', background: 'color-mix(in srgb, var(--indigo) 12%, transparent)' } : undefined}>
            {t('Needs a look')}
            <span className="desk-count">{reviewN}</span>
          </div>
        )}
        {filtered && (
          <button className="desk-link" style={{ marginInlineStart: 4 }} onClick={() => (setQ(''), setKind('all'), setCat('all'), setAcc('all'), setWhen('all'), setReview(false), setFocus(null))}>
            {t('Clear filters')}
          </button>
        )}
      </div>

      {/* What to do with the ticked rows. */}
      {selRows.length > 0 && (
        <div className="desk-card glass-strong" style={{ position: 'sticky', top: 8, zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, flexWrap: 'wrap', animation: 'fadeUp .2s ease' }}>
          <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{tn(selRows.length, '{n} selected', '{n} selected')}</span>
          <span style={{ fontSize: 13, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{money(selRows.filter((x) => !x.toAccId && !x.adjust).reduce((a, x) => a + x.amount, 0))}</span>
          <span style={{ flex: 1 }} />
          <select className="desk-select" value="" onChange={(e) => recat(e.target.value)} aria-label={t('Change category')}>
            <option value="">{t('Change category…')}</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {tData(c)}
              </option>
            ))}
          </select>
          {selRows.some((x) => x.review) && (
            <button className="desk-btn" onClick={markChecked}>
              <DIcon name="check" size={15} />
              {t('Mark as checked')}
            </button>
          )}
          <button className="desk-btn danger" onClick={remove}>
            {t('Delete')}
          </button>
          <button className="desk-icon-btn" onClick={clear} aria-label={t('Clear selection')} title={t('Clear selection')}>
            <svg width="13" height="13" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' }}>
              <path d="M2.5 2.5l8 8M10.5 2.5l-8 8" />
            </svg>
          </button>
        </div>
      )}

      <div className="desk-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="desk-scroll-x" style={{ overflowX: 'auto' }}>
          <table className="desk-table">
            <thead>
              <tr>
                <th style={{ width: 40, paddingInlineEnd: 0 }}>
                  <Box on={allOn} partial={someOn} onClick={() => (allOn || someOn ? clear() : setSel(new Set(rows.map((x) => x.id))))} label={t('Select all')} />
                </th>
                {th('ts', t('Date'))}
                {th('name', t('Description'))}
                {th('cat', t('Category'))}
                <th>{t('Account')}</th>
                {th('amount', t('Amount'), 'num')}
              </tr>
            </thead>
            <tbody>
              {page.map((x: Txn) => {
                const on = sel.has(x.id);
                const c = fcat(x.cat);
                const transfer = !!x.toAccId;
                const plus = !transfer && x.amount > 0;
                return (
                  <tr key={x.id} className={on ? 'sel' : undefined} onClick={() => go('faddtx', { edit: x, back })}>
                    <td style={{ width: 40, paddingInlineEnd: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Box on={on} onClick={() => toggle(x.id)} label={x.name} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }} title={fmtDate(x.ts)}>
                      {date(x.ts, { day: 'numeric', month: 'short', year: new Date(x.ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}
                      <span style={{ color: 'var(--text3)', marginInlineStart: 6 }}>{date(x.ts, { hour: 'numeric', minute: '2-digit' })}</span>
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                        {x.review && <span className="desk-count">{t('Check')}</span>}
                        {x.sms && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>{t('Bank')}</span>}
                      </div>
                      {x.note && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.note}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text2)' }}>
                        <FinIcon icon={c.icon} color="var(--text3)" size={15} />
                        {transfer ? t('Transfer') : x.adjust ? t('Balance correction') : tData(x.cat)}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                      {transfer ? `${tData(accName[x.accId || ''] || '')} → ${tData(accName[x.toAccId!] || '')}` : tData(accName[x.accId || ''] || '—')}
                    </td>
                    <td className="num" style={{ fontWeight: 650, color: plus ? 'var(--success)' : 'var(--text)' }}>
                      {plus ? '+' : transfer ? '' : '−'}
                      {money(x.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '46px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            {filtered ? t('Nothing matches. Try fewer filters.') : t('Nothing logged yet.')}
          </div>
        )}
        {rows.length > shown && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 14, borderTop: '1px solid var(--hairline)' }}>
            <button className="desk-btn" onClick={() => setShown(shown + PAGE)}>
              {t('Show {n} more', { n: Math.min(PAGE, rows.length - shown) })}
            </button>
          </div>
        )}
      </div>
      {s.archive?.txns ? (
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>{t('The table shows the last 13 months. Export CSV, with no filters on, saves your whole history.')}</div>
      ) : null}
    </div>
  );
}
