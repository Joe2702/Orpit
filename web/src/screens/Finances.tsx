import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BarChart, Donut, Spark } from '../lib/charts';
import { ago, money0, moneyShort } from '../lib/format';
import { Card, ChartCard, DetailHeader, RangeSeg, SectionLabel, Stat, StatRow, TrackerAction } from '../ui';
import { TxnRow } from './FinanceScreens';

const HUB: { label: string; icon: string; screen: any; desc: (d: any, s: any) => string }[] = [
  { label: 'Transactions', icon: 'M4 6h12M4 10h12M4 14h8', screen: 'ftxns', desc: (d) => `${d.txnCount} ${d.period.phrase}` },
  { label: 'Budgets', icon: 'M10 3v14M3 10h14', screen: 'fbudgets', desc: (d) => d.budgets.length + ' active' },
  { label: 'Goals', icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 7v3l2 2', screen: 'fgoals', desc: (d) => d.goals.length + ' saving' },
  { label: 'Accounts', icon: 'M3 6h14v9H3zM3 9.5h14M6 12.5h3', screen: 'faccounts', desc: (d) => money0(d.netWorth) },
  { label: 'Recurring', icon: 'M5 8a5 5 0 0 1 9-2M15 5v3h-3M15 12a5 5 0 0 1-9 2M5 15v-3h3', screen: 'frecurring', desc: (d) => money0(d.recurringMonthly) + ' a month' },
  { label: 'Categories', icon: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z', screen: 'fcats', desc: (_d, s) => s.fcats.length + ' set' },
  { label: 'Insights', icon: 'M4 15V8M9 15V4M14 15v-5', screen: 'finsights', desc: () => 'Month vs last' },
];

export function Finances() {
  const { state, go, open } = useStore();
  const { d } = useData();
  const P = d.period;
  // Change across the whole net-worth window (6 months ago → now).
  const nw = d.netWorthSeries;
  const nwChange = nw.length > 1 ? nw[nw.length - 1] - nw[0] : 0;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Finances" />
      <TrackerAction label="Add transaction" onClick={() => go('faddtx')} />

      {/* Net worth leads, because it is the one figure that is true whatever
          range is picked below: opening balances, every account, every row.
          The card it replaces said "Current balance" over the sum of a year of
          income minus spending — account balances left out — so it disagreed
          with the Accounts screen by tens of thousands. */}
      <Card style={{ padding: '18px 18px 14px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>Net worth</div>
          <span onClick={() => go('faccounts')} role="button" style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}>
            {d.accounts.length} {d.accounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', marginTop: 6, lineHeight: 1.1 }}>{(d.netWorth < 0 ? '−' : '') + money0(d.netWorth)}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
          {nwChange === 0 ? (
            'No change over 6 months'
          ) : (
            <>
              <span style={{ fontWeight: 650, color: nwChange > 0 ? 'var(--text)' : 'var(--danger)' }}>
                {nwChange > 0 ? '+' : '−'}
                {money0(nwChange)}
              </span>{' '}
              over 6 months
            </>
          )}
        </div>
        <div style={{ height: 64, marginTop: 14 }}>
          <Spark values={d.netWorthSeries} colorKey="indigo" w={300} h={64} area sw={2.4} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          {d.netWorthLabels.map((l: string, i: number) => (
            <span key={i} style={{ color: i === d.netWorthLabels.length - 1 ? 'var(--text)' : undefined, fontWeight: i === d.netWorthLabels.length - 1 ? 650 : 500 }}>{l}</span>
          ))}
        </div>
      </Card>

      {/* Every account at a glance, each with where its figure comes from. A
          balance a bank reported an hour ago and one typed in last spring
          deserve different amounts of trust, and the card says which it is. */}
      {d.accounts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '-4px -20px 18px', padding: '4px 20px 6px', scrollSnapType: 'x proximity', scrollPaddingInline: 20 }}>
          {d.accounts.map((a) => {
            const fromBank = a.smsBalanceTs != null;
            const tracked = (a.smsLinks || []).length > 0;
            return (
              <div
                key={a.id}
                onClick={() => open('account', { id: a.id, name: a.name, type: a.type, color: a.color, opening: a.opening })}
                className="press99"
                role="button"
                style={{ flex: 'none', minWidth: 148, maxWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '13px 14px', cursor: 'pointer', scrollSnapAlign: 'start' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', color: a.balance < 0 ? 'var(--danger)' : 'var(--text)', marginTop: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {(a.balance < 0 ? '−' : '') + money0(a.balance)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {tracked && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--indigo)', flex: 'none' }} />}
                  {fromBank ? `Bank said · ${ago(a.smsBalanceTs!)}` : tracked ? 'Tracked from SMS' : a.type}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {d.reviewCount > 0 && (
        <div onClick={() => go('freview')} className="press99" role="button" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', boxShadow: 'var(--shadow)', padding: '12px 14px', marginBottom: 18, cursor: 'pointer' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', background: 'var(--indigo)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>{d.reviewCount > 99 ? '99' : d.reviewCount}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>{d.reviewCount === 1 ? 'One payment to check' : `${d.reviewCount} payments to check`}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Orbit wasn&rsquo;t sure what {d.reviewCount === 1 ? 'it was' : 'these were'}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M7 4l5 5-5 5" />
          </svg>
        </div>
      )}

      <RangeSeg period={P} />

      <StatRow>
        <Stat value={money0(d.income)} label="Money in" />
        <Stat value={money0(d.spent)} label="Money out" />
        <Stat value={(d.net >= 0 ? '+' : '−') + money0(d.net)} label={d.income > 0 ? `Net · ${d.savingsRate}% kept` : 'Net'} color={d.net < 0 ? 'var(--danger)' : 'var(--text)'} />
      </StatRow>

      <ChartCard title="Spending" value={money0(d.spent)} note={`${P.caption} · ${money0(d.avgDay)} a day`}>
        <BarChart buckets={d.buckets} values={d.spendBuckets} color="indigo" format={(v) => moneyShort(v)} />
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

      {d.topPlaces.length > 1 && (
        <ChartCard title="Top places">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {d.topPlaces.map((p, i) => {
              const pct = Math.max(4, Math.round((p.total / d.topPlaces[0].total) * 100));
              return (
                <div key={p.name}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 550, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', flex: 'none' }}>{p.count}×</span>
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{moneyShort(p.total)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--surface2)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: i === 0 ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 45%,var(--surface))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}

      {/* A plain list, not a grid of coloured tiles: these are places to go,
          and a list reads faster than seven equal squares. */}
      <SectionLabel style={{ marginTop: 14 }}>Manage</SectionLabel>
      <Card style={{ overflow: 'hidden', marginBottom: 22 }}>
        {HUB.map((h, i) => (
          <div key={h.label} onClick={() => go(h.screen)} className="pressRow" role="button" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: i === HUB.length - 1 ? 'none' : '1px solid var(--hairline)', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d={h.icon} />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 550, color: 'var(--text)' }}>{h.label}</span>
            <span style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' }}>{h.desc(d, state)}</span>
            <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M7 4l5 5-5 5" />
            </svg>
          </div>
        ))}
      </Card>

      <SectionLabel action={{ label: 'See all', onClick: () => go('ftxns') }}>Recent transactions</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {[...state!.txns]
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 6)
          .map((t, i, all) => (
            <TxnRow key={t.id} t={t} onClick={() => go('faddtx', { edit: t })} last={i === all.length - 1} />
          ))}
      </div>

    </div>
  );
}
