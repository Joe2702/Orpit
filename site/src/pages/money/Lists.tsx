import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../store';
import { useOpen } from '../../forms/host';
import { derive } from '@core/lib/derive';
import { money0 } from '@core/lib/format';
import { FinIcon } from '@core/lib/iconPaths';
import { t, tn, tData, date } from '../../i18n';
import { Button, Empty, paint } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { byCategory, startOfDay, startOfMonth } from '../../lib/series';
import { ColorDot } from '../../forms/forms';

function useDerived() {
  const s = useData();
  const day = new Date().toDateString();
  return useMemo(() => derive(s, 'Month', 0), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Accounts() {
  const s = useData();
  const d = useDerived();
  const open = useOpen();
  const nav = useNavigate();
  if (!s.accounts.length)
    return (
      <div className="card">
        <Empty icon="wallet" title={t('No accounts yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'account' })}>{t('New account')}</Button>}>
          {t('An account is anywhere your money sits: a bank, cash, a wallet, a card.')}
        </Empty>
      </div>
    );
  const monthStart = startOfMonth(Date.now());
  return (
    <>
      <div className="card card-pad row" style={{ marginBottom: 16, gap: 28 }}>
        <div>
          <div className="stat-label">{t('Net worth')}</div>
          <div className="stat-value">{money0(d.netWorth)}</div>
        </div>
        <div>
          <div className="stat-label">{t('In the bank and cash')}</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{money0(d.accounts.filter((a: { balance: number }) => a.balance > 0).reduce((x: number, a: { balance: number }) => x + a.balance, 0))}</div>
        </div>
        <div>
          <div className="stat-label">{t('Owed on cards')}</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{money0(-d.accounts.filter((a: { balance: number }) => a.balance < 0).reduce((x: number, a: { balance: number }) => x + a.balance, 0))}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {d.accounts.map((a: (typeof d.accounts)[number]) => {
          const moved = s.txns.filter((x) => (x.accId === a.id || x.toAccId === a.id) && x.ts >= monthStart);
          return (
            <div key={a.id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ height: 3, background: paint(a.color) }} />
              <div className="card-pad">
                <div className="row">
                  <span style={{ fontWeight: 600 }}>{tData(a.name)}</span>
                  <span className="badge">{tData(a.type)}</span>
                  <span className="spacer" />
                  <Button size="sm" kind="ghost" icon="edit" title={t('Edit')} onClick={() => open({ kind: 'account', account: a })} />
                </div>
                <div className="stat-value" style={{ color: a.balance < 0 ? 'var(--bad)' : undefined }}>{money0(a.balance)}</div>
                <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                  {a.smsBalanceTs ? t('Last reported by the bank {when}', { when: date(a.smsBalanceTs, { month: 'short', day: 'numeric' }) }) : tn(moved.length, '{n} transaction this month', '{n} transactions this month')}
                </div>
                <div className="row" style={{ marginTop: 16, gap: 8 }}>
                  <Button size="sm" onClick={() => nav(`/money/transactions?acc=${a.id}`)}>{t('Transactions')}</Button>
                  <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'txn', preset: { accId: a.id } })}>{t('Add')}</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Budgets() {
  const d = useDerived();
  const s = useData();
  const open = useOpen();
  const nav = useNavigate();
  if (!s.budgets.length)
    return (
      <div className="card">
        <Empty icon="pie" title={t('No budgets yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'budget' })}>{t('New budget')}</Button>}>
          {t('Give a category a monthly limit and Orbit warns you while there’s still time to change course.')}
        </Empty>
      </div>
    );
  const now = new Date();
  const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  return (
    <>
      <div className="card card-pad row" style={{ marginBottom: 16, gap: 28 }}>
        <div>
          <div className="stat-label">{t('Budgeted this month')}</div>
          <div className="stat-value">{money0(d.budgetTotal)}</div>
        </div>
        <div>
          <div className="stat-label">{t('Spent of it')}</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{money0(d.budgetSpent)}</div>
        </div>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <div className="stat-label">{tn(left, '{n} day left in the month', '{n} days left in the month')}</div>
          <div className="bar" style={{ height: 10, marginTop: 16 }}>
            <span style={{ width: `${Math.min(100, (d.budgetSpent / Math.max(1, d.budgetTotal)) * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>{t('Category')}</th>
              <th style={{ width: '30%' }}>{t('This month')}</th>
              <th className="r">{t('Spent')}</th>
              <th className="r">{t('Limit')}</th>
              <th className="r">{t('Left')}</th>
              <th>{t('At this pace')}</th>
            </tr>
          </thead>
          <tbody>
            {[...d.budgets]
              .sort((a, b) => b.pct - a.pct)
              .map((b) => {
                const over = b.pct >= 100;
                return (
                  <tr key={b.id} className="click" onClick={() => open({ kind: 'budget', budget: s.budgets.find((x) => x.id === b.id) })}>
                    <td>
                      <span className="row">
                        <span style={{ fontWeight: 600 }}>{tData(b.cat)}</span>
                        {b.rollover && <span className="badge" title={t('Unspent money carries over')}>{t('Rolls over')}</span>}
                      </span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="bar" style={{ flex: 1, height: 8 }}>
                          <span style={{ width: `${Math.min(100, b.pct)}%`, background: over ? 'var(--bad)' : b.pct >= 80 ? 'var(--warn)' : undefined }} />
                        </span>
                        <span className="num" style={{ width: 42, textAlign: 'end', color: over ? 'var(--bad)' : undefined }}>{b.pct}%</span>
                      </span>
                    </td>
                    <td className="r">{money0(b.spent)}</td>
                    <td className="r muted">
                      {money0(b.effLimit)}
                      {b.carried > 0 && <span className="faint" style={{ display: 'block', fontSize: 11 }}>{t('+{amount} carried', { amount: money0(b.carried) })}</span>}
                    </td>
                    <td className="r" style={{ color: over ? 'var(--bad)' : undefined, fontWeight: 600 }}>{over ? `−${money0(b.spent - b.effLimit)}` : money0(b.remaining)}</td>
                    <td>
                      {b.willExceed ? <span className="badge warn">{t('Over by month end')}</span> : over ? <span className="badge bad">{t('Over budget')}</span> : <span className="badge good">{t('On track')}</span>}
                      <button className="link" style={{ marginInlineStart: 8, fontSize: 12 }} onClick={(e) => (e.stopPropagation(), nav(`/money/transactions?cat=${encodeURIComponent(b.cat)}&when=month`))}>
                        {t('See spending')}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Goals() {
  const d = useDerived();
  const s = useData();
  const open = useOpen();
  if (!s.goals.length)
    return (
      <div className="card">
        <Empty icon="target" title={t('No savings goals yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'goal' })}>{t('New goal')}</Button>}>
          {t('Something you’re saving for. Link it to an account and it fills up on its own.')}
        </Empty>
      </div>
    );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {d.goals.map((g: (typeof d.goals)[number]) => {
        const left = Math.max(0, g.target - g.current);
        const months = g.dueTs ? Math.max(1, Math.round((g.dueTs - Date.now()) / (30.4 * 86_400_000))) : null;
        return (
          <div key={g.id} className="card card-pad hover-row" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'goal', goal: s.goals.find((x) => x.id === g.id) })}>
            <div className="row">
              <ColorDot c={g.color} size={10} />
              <span style={{ fontWeight: 600, flex: 1 }} className="truncate">{tData(g.name)}</span>
              <span className="num" style={{ fontWeight: 600 }}>{g.pct}%</span>
            </div>
            <div className="bar" style={{ height: 10, margin: '16px 0 8px' }}>
              <span style={{ width: `${g.pct}%`, background: paint(g.color) }} />
            </div>
            <div className="row num" style={{ fontSize: 14 }}>
              <span>
                <b>{money0(g.current)}</b> <span className="faint">/ {money0(g.target)}</span>
              </span>
              <span className="spacer" />
              <span className="muted">{left > 0 ? t('{amount} to go', { amount: money0(left) }) : t('Reached')}</span>
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {g.followsName ? t('Follows {account}', { account: tData(g.followsName) }) : t('Updated by hand')}
              {g.dueTs && left > 0 && months && ` · ${t('{amount} a month to make {date}', { amount: money0(left / months), date: date(g.dueTs, { month: 'short', year: 'numeric' }) })}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Bills() {
  const d = useDerived();
  const s = useData();
  const open = useOpen();
  const today = startOfDay(Date.now());
  if (!s.recurring.length)
    return (
      <div className="card">
        <Empty icon="repeat" title={t('No repeating payments yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'bill' })}>{t('New repeating payment')}</Button>}>
          {t('Rent, subscriptions, your salary: anything that comes round on a schedule. Safe-to-spend counts on them.')}
        </Empty>
      </div>
    );
  const acc = (id: string | null) => s.accounts.find((a) => a.id === id)?.name;
  return (
    <>
      <div className="card card-pad row" style={{ marginBottom: 16, gap: 28 }}>
        <div>
          <div className="stat-label">{t('Bills, a month')}</div>
          <div className="stat-value">{money0(d.recurringMonthly)}</div>
        </div>
        <div>
          <div className="stat-label">{t('Coming in, a month')}</div>
          <div className="stat-value" style={{ color: 'var(--good)' }}>{money0(d.recurringIncomeMonthly)}</div>
        </div>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Category')}</th>
              <th>{t('Account')}</th>
              <th>{t('How often')}</th>
              <th>{t('Next')}</th>
              <th className="r">{t('Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {d.recurring.map((r) => {
              const days = r.nextTs ? Math.round((startOfDay(r.nextTs) - today) / 86_400_000) : null;
              return (
                <tr key={r.id} className="click" onClick={() => open({ kind: 'bill', bill: r })}>
                  <td>
                    <span className="row">
                      <Icon name={r.income ? 'arrowDown' : 'repeat'} size={14} style={{ color: r.income ? 'var(--good)' : 'var(--text-3)' }} />
                      <span style={{ fontWeight: 600 }}>{tData(r.name)}</span>
                    </span>
                  </td>
                  <td className="muted">{tData(r.cat)}</td>
                  <td className="muted">{acc(r.accId) ? tData(acc(r.accId)!) : '—'}</td>
                  <td className="muted">{tData(r.freq)}</td>
                  <td>
                    {r.nextTs ? (
                      <span className="row" style={{ gap: 8 }}>
                        <span className="num">{date(r.nextTs, { month: 'short', day: 'numeric' })}</span>
                        {days != null && days <= 3 && <span className={`badge ${days < 0 ? 'bad' : 'warn'}`}>{days < 0 ? t('Overdue') : days === 0 ? t('Today') : tn(days, 'in {n} day', 'in {n} days')}</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="r" style={{ fontWeight: 600, color: r.income ? 'var(--good)' : undefined }}>{money0(r.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Categories() {
  const s = useData();
  const open = useOpen();
  const nav = useNavigate();
  const month = new Map(byCategory(s, startOfMonth(Date.now())).map((c) => [c.cat, c.amount]));
  const counts = new Map<string, number>();
  s.txns.forEach((x) => counts.set(x.cat, (counts.get(x.cat) || 0) + 1));
  const table = (kind: 'expense' | 'income', title: string) => {
    const list = s.fcats.filter((c) => (kind === 'income' ? c.kind === 'income' : c.kind !== 'income'));
    return (
      <div className="card c6">
        <div className="card-head">
          <span className="card-title">{title}</span>
          <span className="card-sub">{list.length}</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>{t('Category')}</th>
              <th className="r">{t('Entries')}</th>
              {kind === 'expense' && <th className="r">{t('This month')}</th>}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="click" onClick={() => nav(`/money/transactions?cat=${encodeURIComponent(c.name)}`)}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 7, background: `color-mix(in srgb, ${paint(c.color)} 16%, transparent)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FinIcon icon={c.icon} color={paint(c.color)} size={15} />
                    </span>
                    <span style={{ fontWeight: 500 }}>{tData(c.name)}</span>
                  </span>
                </td>
                <td className="r muted">{counts.get(c.name) || 0}</td>
                {kind === 'expense' && <td className="r">{month.get(c.name) ? money0(month.get(c.name)!) : <span className="faint">—</span>}</td>}
                <td className="r" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" kind="ghost" icon="edit" title={t('Edit')} onClick={() => open({ kind: 'fcat', cat: c })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className="grid">
      {table('expense', t('Spending categories'))}
      {table('income', t('Income categories'))}
    </div>
  );
}
