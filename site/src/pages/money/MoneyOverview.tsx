import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../store';
import { useOpen } from '../../forms/host';
import { derive } from '@core/lib/derive';
import { money0, moneyShort } from '@core/lib/format';
import { FinIcon, guessFinIcon } from '@core/lib/iconPaths';
import { t, tn, tData, date } from '../../i18n';
import { Button, Delta, Empty } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { BarChart, LineChart, RankBars } from '../../charts/charts';
import { byCategory, change, monthlyFlow, startOfMonth } from '../../lib/series';
import { ColorDot } from '../../forms/forms';

export function MoneyOverview() {
  const s = useData();
  const open = useOpen();
  const nav = useNavigate();
  const now = Date.now();
  const day = new Date().toDateString();
  const d = useMemo(() => derive(s, 'Month', 0), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow = useMemo(() => monthlyFlow(s, 6, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = byCategory(s, startOfMonth(now));
  const lastCats = new Map(byCategory(s, startOfMonth(now, -1), startOfMonth(now)).map((c) => [c.cat, c.amount]));
  const saved = d.incThisMonth - d.spentThisMonth;
  const reviewN = s.txns.filter((x) => x.review).length;

  if (!s.txns.length && !s.accounts.length)
    return (
      <div className="card">
        <Empty icon="wallet" title={t('Start with an account')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'account' })}>{t('New account')}</Button>}>
          {t('Add your bank, cash or wallet with what’s in it now, then log what you spend. On Android, Orbit can read your bank texts for you.')}
        </Empty>
      </div>
    );

  return (
    <>
      {reviewN > 0 && (
        <div className="banner" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => nav('/money/transactions?review=1')}>
          <Icon name="eye" size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ flex: 1 }}>{tn(reviewN, '{n} payment read from your bank texts needs a quick look.', '{n} payments read from your bank texts need a quick look.')}</span>
          <span className="link">{t('Check them')}</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="stat-label">{t('Net worth')}</div>
          <div className="stat-value">{money0(d.netWorth)}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{tn(s.accounts.length, 'across {n} account', 'across {n} accounts')}</div>
        </div>
        <div className="card card-pad">
          <div className="stat-label">{t('Spent this month')}</div>
          <div className="stat-value">{money0(d.spentThisMonth)}</div>
          <div className="faint row" style={{ fontSize: 12, marginTop: 4, gap: 8 }}>
            {d.budgetTotal > 0 ? t('of {amount} budgeted', { amount: money0(d.budgetTotal) }) : <><Delta pct={change(d.spentThisMonth, d.spentPrevMonth)} goodWhenUp={false} /> {t('vs. all of last month')}</>}
          </div>
        </div>
        <div className="card card-pad">
          <div className="stat-label">{t('Came in this month')}</div>
          <div className="stat-value">{money0(d.incThisMonth)}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{saved >= 0 ? t('{amount} more than went out', { amount: money0(saved) }) : t('{amount} less than went out', { amount: money0(-saved) })}</div>
        </div>
        <div className="card card-pad">
          <div className="stat-label">{t('Safe to spend')}</div>
          <div className="stat-value">{d.safe ? money0(Math.max(0, d.safe.perDay)) : '—'}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{d.safe ? t('a day until the month ends, after {amount} of bills', { amount: money0(d.safe.billsLeft) }) : t('Add income or a budget to see this')}</div>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">{t('Spending by month')}</span>
          </div>
          <div className="card-body">
            <BarChart height={220} fmt={moneyShort} tipFmt={(v) => money0(v || 0)} data={flow.map((m, i) => ({ label: date(m.start, { month: 'short' }), value: m.spent, title: date(m.start, { month: 'long', year: 'numeric' }), now: i === flow.length - 1 }))} />
          </div>
        </div>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">{t('Income by month')}</span>
          </div>
          <div className="card-body">
            <BarChart height={220} fmt={moneyShort} tipFmt={(v) => money0(v || 0)} data={flow.map((m, i) => ({ label: date(m.start, { month: 'short' }), value: m.income, title: date(m.start, { month: 'long', year: 'numeric' }), now: i === flow.length - 1 }))} />
          </div>
        </div>
        <div className="card c8">
          <div className="card-head">
            <span className="card-title">{t('Net worth, last six months')}</span>
            <span className="card-sub">{t('Everything in your accounts at the end of each month')}</span>
          </div>
          <div className="card-body">
            <LineChart height={240} fmt={moneyShort} data={d.netWorthSeries.map((v: number, i: number) => ({ label: d.netWorthLabels[i], title: d.netWorthLabels[i], value: v }))} />
          </div>
        </div>
        <div className="card c4">
          <div className="card-head">
            <span className="card-title">{t('Accounts')}</span>
            <span className="spacer" />
            <button className="link" onClick={() => nav('/money/accounts')}>{t('Manage')}</button>
          </div>
          {d.accounts.map((a: (typeof d.accounts)[number]) => (
            <div key={a.id} className="list-row hover-row click" onClick={() => nav(`/money/transactions?acc=${a.id}`)}>
              <ColorDot c={a.color} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="truncate" style={{ display: 'block', fontWeight: 500 }}>{tData(a.name)}</span>
                <span className="faint" style={{ fontSize: 12 }}>{tData(a.type)}</span>
              </span>
              <span className="num" style={{ fontWeight: 600, color: a.balance < 0 ? 'var(--bad)' : undefined }}>{money0(a.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{t('This month by category')}</span>
          <span className="card-sub">{t('Compared with last month')}</span>
        </div>
        <div className="card-body">
          {cats.length === 0 ? (
            <div className="faint">{t('No spending logged this month.')}</div>
          ) : (
            <RankBars
              fmt={money0}
              rows={cats.map((c) => {
                const f = s.fcats.find((x) => x.name === c.cat) || guessFinIcon(c.cat);
                const before = lastCats.get(c.cat) || 0;
                return {
                  key: c.cat,
                  label: (
                    <span className="row" style={{ gap: 8 }}>
                      <FinIcon icon={f.icon} color="var(--text-3)" size={15} />
                      {tData(c.cat)}
                    </span>
                  ),
                  value: c.amount,
                  sub: before ? t('{amount} last month', { amount: money0(before) }) : undefined,
                  onClick: () => nav(`/money/transactions?cat=${encodeURIComponent(c.cat)}&when=month`),
                };
              })}
            />
          )}
        </div>
      </div>
    </>
  );
}
