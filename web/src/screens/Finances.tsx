import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Donut, Spark } from '../lib/charts';
import { money, signMoney, relLabel } from '../lib/format';
import { DetailHeader, RangeSeg, SectionLabel } from '../ui';
import { IconExpense } from '../icons';

const HUB: { label: string; color: string; icon: string; screen: any; desc: (d: any, s: any) => string }[] = [
  { label: 'Transactions', color: 'blue', icon: 'M4 6h12M4 10h12M4 14h8', screen: 'ftxns', desc: (d) => d.txnCount + ' entries' },
  { label: 'Budgets', color: 'emerald', icon: 'M10 3v14M3 10h14', screen: 'fbudgets', desc: (d) => d.budgets.length + ' active' },
  { label: 'Goals', color: 'indigo', icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 7v3l2 2', screen: 'fgoals', desc: (d) => d.goals.length + ' saving' },
  { label: 'Accounts', color: 'coral', icon: 'M3 6h14v9H3zM3 9.5h14M6 12.5h3', screen: 'faccounts', desc: (d) => money(d.netWorth) },
  { label: 'Recurring', color: 'teal', icon: 'M5 8a5 5 0 0 1 9-2M15 5v3h-3M15 12a5 5 0 0 1-9 2M5 15v-3h3', screen: 'frecurring', desc: (d) => money(d.recurringMonthly) + '/mo' },
  { label: 'Categories', color: 'warning', icon: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z', screen: 'fcats', desc: (_d, s) => s.fcats.length + ' set' },
  { label: 'Insights', color: 'blue', icon: 'M4 15V8M9 15V4M14 15v-5', screen: 'finsights', desc: () => 'vs last month' },
];

export function Finances() {
  const { state, go, range, setRange } = useStore();
  const { d } = useData();
  const spendMax = money(Math.max(...d.spendSeries.concat([1])));

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Finances" iconColor="emerald" icon={<IconExpense size={22} />} />
      <RangeSeg />

      <div onClick={() => go('faddtx')} className="press99" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: 'var(--indigo)', color: '#fff', height: 52, borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16, boxShadow: '0 10px 22px -12px rgba(40,36,28,.30)' }}>
        <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 4v12M4 10h12" /></svg>
        Add transaction
      </div>

      <div style={{ background: 'var(--emerald)', borderRadius: 22, padding: 22, marginBottom: 12, boxShadow: '0 10px 26px -14px rgba(40,36,28,.30)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>Current balance</div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.03em', color: '#fff', marginTop: 4 }}>{money(d.balance)}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 18 }}>
          {[['Income', money(d.income)], ['Spent', money(d.spent)], ['Net', signMoney(d.net)]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,.14)', borderRadius: 13, padding: '10px 12px' }}>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.82)' }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 14 }}>
        {[[d.savingsRate + '%', 'Savings rate'], [money(d.avgDay), 'Avg / day'], [String(d.txnCount), 'Transactions']].map(([v, l], i) => (
          <React.Fragment key={l}>
            {i > 0 && <div style={{ width: 1, background: 'var(--border)' }} />}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{v}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>{l}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 14 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Spending by category</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 146, height: 146, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Donut segs={d.fCatSegs} size={146} stroke={24} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{money(d.spent)}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: -2 }}>spent</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {d.fCatSegs.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: s.color }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{s.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{money(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spending over time (Weekly / Monthly toggle reuses the range) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 14 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Spending over time</SectionLabel>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
          {(['Week', 'Month'] as const).map((r) => (
            <div key={r} onClick={() => setRange(r)} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(range === r ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) }}>
              {r === 'Week' ? 'Weekly' : 'Monthly'}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', width: 42, height: 120, flex: 'none', fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ position: 'absolute', top: -5, right: 0 }}>{spendMax}</span>
            <span style={{ position: 'absolute', bottom: -5, right: 0 }}>$0</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 120 }}>
              <Spark values={d.spendSeries.map((v) => v || 0.001)} colorKey="emerald" w={300} h={120} area sw={2.6} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
              {d.xLabels.map((l, i) => (<span key={i}>{l}</span>))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 24 }}>
        <SectionLabel style={{ marginBottom: 10 }}>Balance trend</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', width: 42, height: 108, flex: 'none', fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ position: 'absolute', top: -5, right: 0 }}>{money(d.fYMax)}</span>
            <span style={{ position: 'absolute', bottom: -5, right: 0 }}>{money(d.fYMin)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 108 }}>
              <Spark values={d.fTrend} colorKey="emerald" w={300} h={108} area sw={2.8} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
              <span>Older</span>
              <span>Running balance →</span>
            </div>
          </div>
        </div>
      </div>

      <SectionLabel>Manage</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {HUB.map((h) => (
          <div key={h.label} onClick={() => go(h.screen)} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,var(--${h.color}) 13%,transparent)` }}>
              <svg width="22" height="22" viewBox="0 0 20 20" style={{ fill: 'none', stroke: `var(--${h.color})`, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d={h.icon} /></svg>
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{h.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{h.desc(d, state)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)' }}>Recent transactions</span>
        <span onClick={() => go('ftxns')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--emerald)', cursor: 'pointer' }}>See all</span>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {[...state!.txns].sort((a, b) => b.ts - a.ts).slice(0, 6).map((t) => (
          <div key={t.id} onClick={() => go('faddtx', { edit: t })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.income ? 'color-mix(in srgb,var(--emerald) 13%,transparent)' : 'var(--bg)' }}>
              {t.income ? (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--emerald)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M7 7l6 6M13 7v6H7" /></svg>
              ) : (
                <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M13 13L7 7M7 13V7h6" /></svg>
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t.cat} · {relLabel(t.ts)}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flex: 'none', color: t.income ? 'var(--emerald)' : 'var(--text)' }}>
              {(t.income ? '+ ' : '− ') + money(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
