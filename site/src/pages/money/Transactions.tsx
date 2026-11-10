import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Txn } from '@core/types';
import { useStore, useData } from '../../store';
import { useOpen } from '../../forms/host';
import { api } from '../../api';
import { dayKey, money, money0 } from '@core/lib/format';
import { isIncome, isSpend } from '@core/lib/money';
import { FinIcon, guessFinIcon } from '@core/lib/iconPaths';
import { t, tn, tData, date } from '../../i18n';
import { Button, Check, Empty } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { downloadCsv, toCsv } from '../../lib/csv';
import { exportCsv, txnRows } from '../../lib/exports';
import { startOfMonth } from '../../lib/series';

// Every payment as a real table. The filters live in the address, so a view
// can be bookmarked or opened from a chart, and Back undoes a filter.

type Kind = 'all' | 'spend' | 'income' | 'transfer';
type When = 'all' | 'month' | 'last' | '3m' | 'year';
type Sort = 'ts' | 'name' | 'cat' | 'amount';
const PAGE = 100;

function range(w: When, now = Date.now()): [number, number] {
  if (w === 'month') return [startOfMonth(now), Infinity];
  if (w === 'last') return [startOfMonth(now, -1), startOfMonth(now)];
  if (w === '3m') return [startOfMonth(now, -2), Infinity];
  if (w === 'year') return [new Date(new Date(now).getFullYear(), 0, 1).getTime(), Infinity];
  return [-Infinity, Infinity];
}

export function Transactions() {
  const s = useData();
  const { mutate, confirm, toast } = useStore();
  const open = useOpen();
  const [qs, setQs] = useSearchParams();
  const q = qs.get('q') || '';
  const kind = (qs.get('kind') as Kind) || 'all';
  const cat = qs.get('cat') || 'all';
  const acc = qs.get('acc') || 'all';
  const when = (qs.get('when') as When) || 'all';
  const review = qs.get('review') === '1';
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(qs);
    if (v == null || v === 'all' || v === '') n.delete(k);
    else n.set(k, v);
    setQs(n, { replace: k === 'q' });
    setShown(PAGE);
  };
  const [sort, setSort] = useState<{ key: Sort; dir: 1 | -1 }>({ key: 'ts', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const accName = useMemo(() => Object.fromEntries(s.accounts.map((a) => [a.id, a.name])), [s.accounts]);
  const cats = useMemo(() => [...new Set([...s.fcats.map((c) => c.name), ...s.txns.filter((x) => !x.toAccId).map((x) => x.cat)])].filter(Boolean).sort((a, b) => tData(a).localeCompare(tData(b))), [s.fcats, s.txns]);
  const reviewN = s.txns.filter((x) => x.review).length;

  const rows = useMemo(() => {
    const [from, to] = range(when);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = s.txns.filter((x) => {
      if (x.ts < from || x.ts >= to) return false;
      if (kind === 'spend' && !(isSpend(x) && !x.toAccId && !x.adjust)) return false;
      if (kind === 'income' && !isIncome(x)) return false;
      if (kind === 'transfer' && !x.toAccId) return false;
      if (cat !== 'all' && (x.cat !== cat || x.toAccId)) return false;
      if (acc !== 'all' && x.accId !== acc && x.toAccId !== acc) return false;
      if (review && !x.review) return false;
      if (words.length) {
        const hay = `${x.name} ${x.cat} ${tData(x.cat)} ${x.note || ''} ${accName[x.accId || ''] || ''} ${Math.abs(x.amount)}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      const v = sort.key === 'ts' ? a.ts - b.ts : sort.key === 'amount' ? a.amount - b.amount : sort.key === 'name' ? a.name.localeCompare(b.name) : tData(a.cat).localeCompare(tData(b.cat));
      return (v || b.ts - a.ts) * sort.dir;
    });
    return out;
  }, [s.txns, q, kind, cat, acc, when, review, sort, accName]);

  const counted = rows.filter((x) => !x.toAccId && !x.adjust);
  const out_ = counted.filter(isSpend).reduce((a, x) => a - x.amount, 0);
  const in_ = counted.filter(isIncome).reduce((a, x) => a + x.amount, 0);
  const selRows = rows.filter((x) => sel.has(x.id));
  const allOn = rows.length > 0 && selRows.length === rows.length;
  const filtered = !!(q || kind !== 'all' || cat !== 'all' || acc !== 'all' || when !== 'all' || review);
  const clear = () => setSel(new Set());
  const toggle = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const pendingSel = () => {
    if (!selRows.some((x) => x.id.startsWith('tmp'))) return false;
    toast(t('Some of these are still saving. Try again in a moment.'), { bad: true });
    return true;
  };
  const recat = (to: string) => {
    if (!to || pendingSel()) return;
    const ids = selRows.filter((x) => !x.toAccId && !x.adjust).map((x) => x.id);
    if (!ids.length) return;
    mutate((st) => ({ ...st, txns: st.txns.map((x) => (ids.includes(x.id) ? { ...x, cat: to, review: false, auto: false } : x)) }), () => api.recategorise(ids, to), tn(ids.length, 'Moved {n} entry to {cat}', 'Moved {n} entries to {cat}', { cat: tData(to) }));
    clear();
  };
  const checked = () => {
    if (pendingSel()) return;
    const ids = selRows.filter((x) => x.review).map((x) => x.id);
    if (!ids.length) return;
    mutate((st) => ({ ...st, txns: st.txns.map((x) => (ids.includes(x.id) ? { ...x, review: false } : x)) }), () => api.markReviewed(ids), tn(ids.length, '{n} entry checked', '{n} entries checked'));
    clear();
  };
  const remove = async () => {
    if (pendingSel()) return;
    const ids = selRows.map((x) => x.id);
    const ok = await confirm({ title: tn(ids.length, 'Delete {n} entry?', 'Delete {n} entries?'), message: t('They come off every total and balance. Payments read from bank messages stay deleted, even if the message is read again.'), confirm: t('Delete'), danger: true });
    if (!ok) return;
    const gone = new Set(ids);
    mutate((st) => ({ ...st, txns: st.txns.filter((x) => !gone.has(x.id)) }), () => api.deleteTxns(ids), tn(ids.length, '{n} entry deleted', '{n} entries deleted'));
    clear();
  };
  const download = async () => {
    if (!selRows.length && !filtered) {
      const n = await exportCsv('txns', s);
      return toast(tn(n, '{n} row saved as a spreadsheet', '{n} rows saved as a spreadsheet'));
    }
    const { header, rows: r } = txnRows(selRows.length ? selRows : rows, s.accounts);
    downloadCsv(`orbit-transactions-${dayKey()}.csv`, toCsv(header, r));
    toast(tn(r.length, '{n} row saved as a spreadsheet', '{n} rows saved as a spreadsheet'));
  };

  const th = (key: Sort, label: string, right?: boolean) => (
    <th className={`sort${right ? ' r' : ''}`} onClick={() => setSort((c) => ({ key, dir: c.key === key ? (-c.dir as 1 | -1) : key === 'ts' || key === 'amount' ? -1 : 1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <span className="row" style={{ gap: 4, justifyContent: right ? 'flex-end' : undefined }}>
        {label}
        {sort.key === key && <Icon name={sort.dir === 1 ? 'arrowUp' : 'arrowDown'} size={11} sw={2.2} />}
      </span>
    </th>
  );
  const select = (value: string, k: string, opts: [string, string][], label: string, width = 160) => (
    <select className="select" style={{ width }} value={value} onChange={(e) => set(k, e.target.value)} aria-label={label}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div className="input-wrap" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <Icon name="search" size={15} />
          <input className="input" value={q} onChange={(e) => set('q', e.target.value)} placeholder={t('Search name, category, note or amount')} aria-label={t('Search')} />
        </div>
        {select(when, 'when', [['all', t('All time')], ['month', t('This month')], ['last', t('Last month')], ['3m', t('Last 3 months')], ['year', t('This year')]], t('When'), 150)}
        {select(kind, 'kind', [['all', t('Everything')], ['spend', t('Spending')], ['income', t('Income')], ['transfer', t('Transfers')]], t('Type'), 140)}
        {select(cat, 'cat', [['all', t('All categories')], ...cats.map((c) => [c, tData(c)] as [string, string])], t('Category'), 180)}
        {s.accounts.length > 1 && select(acc, 'acc', [['all', t('All accounts')], ...s.accounts.map((a) => [a.id, tData(a.name)] as [string, string])], t('Account'), 170)}
        {reviewN > 0 && (
          <button className={`btn${review ? ' primary' : ''}`} onClick={() => set('review', review ? null : '1')} aria-pressed={review}>
            {t('Needs a look')}
            <span className="badge" style={review ? { background: 'transparent', color: 'inherit', borderColor: 'currentColor' } : undefined}>{reviewN}</span>
          </button>
        )}
        {filtered && (
          <button className="link" onClick={() => setQs(new URLSearchParams())}>
            {t('Clear filters')}
          </button>
        )}
        <span className="spacer" />
        <Button icon="download" onClick={download} disabled={!rows.length}>
          {selRows.length ? t('Export selected') : filtered ? t('Export these') : t('Export CSV')}
        </Button>
      </div>

      <div className="card">
        <div className="card-head" style={{ minHeight: 48, position: 'sticky', top: 'var(--nav-h)', zIndex: 3, background: selRows.length ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)', borderRadius: '12px 12px 0 0' }}>
          {selRows.length ? (
            <>
              <b className="num">{tn(selRows.length, '{n} selected', '{n} selected')}</b>
              <span className="faint num">{money(selRows.filter((x) => !x.toAccId && !x.adjust).reduce((a, x) => a + x.amount, 0))}</span>
              <span className="spacer" />
              <select className="select" style={{ width: 190, height: 30 }} value="" onChange={(e) => recat(e.target.value)} aria-label={t('Change category')}>
                <option value="">{t('Change category…')}</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {tData(c)}
                  </option>
                ))}
              </select>
              {selRows.some((x) => x.review) && (
                <Button size="sm" icon="check" onClick={checked}>
                  {t('Mark as checked')}
                </Button>
              )}
              <Button size="sm" kind="danger" icon="trash" onClick={remove}>
                {t('Delete')}
              </Button>
              <Button size="sm" kind="ghost" icon="x" title={t('Clear selection')} onClick={clear} />
            </>
          ) : (
            <>
              <span className="card-title num">{tn(rows.length, '{n} entry', '{n} entries')}</span>
              <span className="spacer" />
              <span className="muted num" style={{ fontSize: 14 }}>
                {t('Out')} <b style={{ color: 'var(--text)' }}>{money0(out_)}</b>
                <span style={{ margin: '0 8px', color: 'var(--line-2)' }}>|</span>
                {t('In')} <b style={{ color: 'var(--good)' }}>{money0(in_)}</b>
              </span>
            </>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty icon="list" title={filtered ? t('Nothing matches') : t('No transactions yet')} action={!filtered && <Button kind="primary" icon="plus" onClick={() => open({ kind: 'txn' })}>{t('New transaction')}</Button>}>
            {filtered ? t('Try fewer filters.') : undefined}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <Check on={allOn} partial={selRows.length > 0 && !allOn} onChange={() => (selRows.length ? clear() : setSel(new Set(rows.map((x) => x.id))))} label={t('Select all')} />
                  </th>
                  {th('ts', t('Date'))}
                  {th('name', t('Description'))}
                  {th('cat', t('Category'))}
                  <th>{t('Account')}</th>
                  {th('amount', t('Amount'), true)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((x: Txn) => {
                  const on = sel.has(x.id);
                  const f = s.fcats.find((c) => c.name === x.cat) || guessFinIcon(x.cat);
                  const transfer = !!x.toAccId;
                  const plus = !transfer && x.amount > 0;
                  return (
                    <tr key={x.id} className={`click${on ? ' sel' : ''}`} onClick={() => open({ kind: 'txn', txn: x })}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Check on={on} onChange={() => toggle(x.id)} label={x.name} />
                      </td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {date(x.ts, { month: 'short', day: 'numeric', year: new Date(x.ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}
                        <span className="faint" style={{ marginInlineStart: 8 }}>{date(x.ts, { hour: 'numeric', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <span className="row" style={{ minWidth: 0 }}>
                          <span className="truncate" style={{ fontWeight: 600 }}>{x.name}</span>
                          {x.review && <span className="badge accent">{x.dupOf ? t('Duplicate?') : t('Check')}</span>}
                          {x.sms && <span className="badge">{t('Bank text')}</span>}
                        </span>
                        {x.note && <span className="faint truncate" style={{ display: 'block', fontSize: 12, marginTop: 1 }}>{x.note}</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="row muted" style={{ gap: 8 }}>
                          {transfer ? <Icon name="transfer" size={15} /> : <FinIcon icon={f.icon} color="var(--text-3)" size={15} />}
                          {transfer ? t('Transfer') : x.adjust ? t('Balance correction') : tData(x.cat)}
                        </span>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {transfer ? `${tData(accName[x.accId || ''] || '')} → ${tData(accName[x.toAccId!] || '')}` : x.accId ? tData(accName[x.accId] || '') : '—'}
                      </td>
                      <td className="r" style={{ fontWeight: 600, color: plus ? 'var(--good)' : undefined }}>
                        {plus ? '+' : transfer ? '' : '−'}
                        {money(x.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line-soft)' }}>
            <Button size="sm" onClick={() => setShown(shown + PAGE)}>
              {t('Show {n} more', { n: Math.min(PAGE, rows.length - shown) })}
            </Button>
          </div>
        )}
      </div>
      {s.archive?.txns ? <div className="faint" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>{t('The table shows the last 13 months. Export CSV, with no filters on, saves your whole history.')}</div> : null}
    </>
  );
}
