import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BarChart, Donut, Spark } from '../lib/charts';
import { money, money0, moneyShort, relLabel, CURRENCIES } from '../lib/format';
import { Card, ChartCard, DetailHeader, RangeSeg, SectionLabel, Stat, StatRow, TrackerAction } from '../ui';
import { IconExpense } from '../icons';
import { api } from '../api';

const HUB: { label: string; color: string; icon: string; screen: any; desc: (d: any, s: any) => string }[] = [
  { label: 'Transactions', color: 'blue', icon: 'M4 6h12M4 10h12M4 14h8', screen: 'ftxns', desc: (d) => `${d.txnCount} ${d.period.phrase}` },
  { label: 'Budgets', color: 'emerald', icon: 'M10 3v14M3 10h14', screen: 'fbudgets', desc: (d) => d.budgets.length + ' active' },
  { label: 'Goals', color: 'indigo', icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 7v3l2 2', screen: 'fgoals', desc: (d) => d.goals.length + ' saving' },
  { label: 'Accounts', color: 'coral', icon: 'M3 6h14v9H3zM3 9.5h14M6 12.5h3', screen: 'faccounts', desc: (d) => money0(d.netWorth) },
  { label: 'Recurring', color: 'teal', icon: 'M5 8a5 5 0 0 1 9-2M15 5v3h-3M15 12a5 5 0 0 1-9 2M5 15v-3h3', screen: 'frecurring', desc: (d) => money0(d.recurringMonthly) + ' a month' },
  { label: 'Categories', color: 'warning', icon: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z', screen: 'fcats', desc: (_d, s) => s.fcats.length + ' set' },
  { label: 'Insights', color: 'purple', icon: 'M4 15V8M9 15V4M14 15v-5', screen: 'finsights', desc: () => 'Month vs last' },
];

export function Finances() {
  const { state, go, mutateOpt } = useStore();
  const { d } = useData();
  const P = d.period;
  // Change across the whole net-worth window (6 months ago → now).
  const nw = d.netWorthSeries;
  const nwChange = nw.length > 1 ? nw[nw.length - 1] - nw[0] : 0;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Finances" iconColor="emerald" icon={<IconExpense size={21} />} />
      <TrackerAction color="emerald" label="Add transaction" onClick={() => go('faddtx')} />

      {/* Net worth leads, because it is the one figure that is true whatever
          range is picked below: opening balances, every account, every row.
          The card it replaces said "Current balance" over the sum of a year of
          income minus spending — account balances left out — so it disagreed
          with the Accounts screen by tens of thousands. */}
      <Card style={{ padding: '18px 18px 14px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)' }}>Net worth</div>
          <span onClick={() => go('faccounts')} role="button" style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}>
            {d.accounts.length} {d.accounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', marginTop: 6, lineHeight: 1.1 }}>{money0(d.netWorth)}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
          {nwChange === 0 ? (
            'No change over 6 months'
          ) : (
            <>
              <span style={{ fontWeight: 650, color: nwChange > 0 ? 'var(--emerald)' : 'var(--danger)' }}>
                {nwChange > 0 ? '+' : '−'}
                {money0(nwChange)}
              </span>{' '}
              over 6 months
            </>
          )}
        </div>
        <div style={{ height: 64, marginTop: 14 }}>
          <Spark values={d.netWorthSeries} colorKey={nwChange < 0 ? 'coral' : 'emerald'} w={300} h={64} area sw={2.4} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          {d.netWorthLabels.map((l: string, i: number) => (
            <span key={i} style={{ color: i === d.netWorthLabels.length - 1 ? 'var(--text)' : undefined, fontWeight: i === d.netWorthLabels.length - 1 ? 650 : 500 }}>{l}</span>
          ))}
        </div>
      </Card>

      <RangeSeg period={P} />

      <StatRow>
        <Stat value={money0(d.income)} label="Money in" size="md" />
        <Stat value={money0(d.spent)} label="Money out" size="md" />
        <Stat value={(d.net >= 0 ? '+' : '−') + money0(d.net)} label="Net" size="md" color={d.net > 0 ? 'var(--emerald)' : d.net < 0 ? 'var(--danger)' : 'var(--text)'} />
      </StatRow>
      <StatRow>
        <Stat value={d.income > 0 ? `${d.savingsRate}%` : '—'} label="Saved" size="sm" />
        <Stat value={money0(d.avgDay)} label="Per day" size="sm" />
        <Stat value={d.txnCount} label="Transactions" size="sm" />
      </StatRow>

      <ChartCard title="Spending" value={money0(d.spent)} note={P.caption}>
        <BarChart buckets={d.buckets} values={d.spendBuckets} color="emerald" format={(v) => moneyShort(v)} />
      </ChartCard>

      {d.fCatSegs.length > 0 && (
        <ChartCard title="Where it went" action={{ label: 'Details', onClick: () => go('finsights') }}>
          {/* Wraps: with a large text size the legend drops under the ring
              instead of being squeezed to a sliver beside it. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 128, height: 128, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Donut segs={d.fCatSegs} size={128} stroke={16} />
              <div style={{ position: 'absolute', textAlign: 'center', maxWidth: 92 }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{moneyShort(d.spent)}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>spent</div>
              </div>
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {d.fCatSegs.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: s.color }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{moneyShort(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      )}

      <SectionLabel style={{ marginTop: 14 }}>Manage</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
        {HUB.map((h) => (
          <div key={h.label} onClick={() => go(h.screen)} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,var(--${h.color}) 13%,transparent)` }}>
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ fill: 'none', stroke: `var(--${h.color})`, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d={h.icon} /></svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>{h.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.desc(d, state)}</div>
            </div>
          </div>
        ))}
      </div>

      <SectionLabel action={{ label: 'See all', onClick: () => go('ftxns') }}>Recent transactions</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {[...state!.txns].sort((a, b) => b.ts - a.ts).slice(0, 6).map((t) => (
          <div key={t.id} onClick={() => go('faddtx', { edit: t })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.income ? 'color-mix(in srgb,var(--emerald) 13%,transparent)' : 'var(--bg)' }}>
              {t.adjust ? (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--blue)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Balance correction"><path d="M4 13.5a6 6 0 0 1 10-4.4M16 6.5a6 6 0 0 1-10 4.4" /><path d="M14 5v4h-4M6 15v-4h4" /></svg>
              ) : t.toAccId ? (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--blue)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Transfer"><path d="M3 7h12M12 4l3 3-3 3M17 13H5M8 10l-3 3 3 3" /></svg>
              ) : t.income ? (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--emerald)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M7 7l6 6M13 7v6H7" /></svg>
              ) : (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M13 13L7 7M7 13V7h6" /></svg>
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t.cat} · {relLabel(t.ts)}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flex: 'none', color: t.toAccId || t.adjust ? 'var(--text2)' : t.income ? 'var(--emerald)' : 'var(--text)' }}>
              {(t.toAccId ? '' : t.adjust ? (t.amount >= 0 ? '+' : '−') : t.income ? '+' : '−') + money(t.amount)}
            </div>
          </div>
        ))}
      </div>

      <SectionLabel style={{ marginTop: 22 }}>Currency</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 24 }}>
        {CURRENCIES.map((c) => {
          const active = (state!.profile.currency || 'EGP') === c.code;
          return (
            <div
              key={c.code}
              onClick={() =>
                mutateOpt(
                  (s) => ({ ...s, profile: { ...s.profile, currency: c.code } }),
                  () => api.updateMe({ currency: c.code })
                )
              }
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .15s',
                border: `1.5px solid ${active ? 'var(--emerald)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb,var(--emerald) 12%,transparent)' : 'var(--surface)',
                color: active ? 'var(--emerald)' : 'var(--text2)',
              }}
            >
              {c.symbol.trim()} {c.code}
            </div>
          );
        })}
      </div>
    </div>
  );
}
