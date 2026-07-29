import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { Bars, Candles, Spark, Ring } from '../lib/charts';
import { hm, money, signMoney, cNum } from '../lib/format';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { RangeSeg } from '../ui';
import { enabled } from '../lib/modules';

function Arrow() {
  return (
    <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', marginLeft: 4 }}>
      <path d="M7 4l5 5-5 5" />
    </svg>
  );
}

export function Analytics() {
  const { state, go, mutate, range, open, openReport } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;

  const blocks: Record<string, React.ReactNode> = {
    workouts: (
      <div onClick={() => go('workouts')} className="press99" style={cardB}>
        <div style={rowHead}>
          <span style={dot('coral')} />
          <span style={title}>Workouts</span>
          <span style={statRight}>{d.wTotalMin} min</span>
          <Arrow />
        </div>
        <div style={{ height: 96 }}>
          <Bars values={d.wMinSeries} colorKey="coral" h={96} w={300} gap={9} />
        </div>
        <div style={sub}>{d.wCount} sessions · {d.wActiveDays} active days</div>
      </div>
    ),
    sleep: (
      <div onClick={() => go('sleep')} className="press99" style={cardB}>
        <div style={rowHead}>
          <span style={dot('blue')} />
          <span style={title}>Sleep</span>
          <span style={statRight}>{hm(d.slAvg)}</span>
          <Arrow />
        </div>
        <div style={{ height: 96 }}>
          <Candles items={d.sleepCandles} w={300} h={96} />
        </div>
        <div style={sub}>Avg quality {d.slAvgQ.toFixed(1)} / 10 · {d.slNights} nights</div>
      </div>
    ),
    habits: (
      <div style={cardB}>
        <div onClick={() => go('habits')} className="press" style={{ display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer' }}>
          <div style={{ position: 'relative', width: 72, height: 72, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ring pct={h.habitPct} colorKey="teal" size={72} stroke={9} />
            <div style={{ position: 'absolute', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{h.habitPct}%</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...rowHead, marginBottom: 6 }}>
              <span style={dot('teal')} />
              <span style={title}>Habits</span>
              <Arrow />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              {h.weekDone} of {h.weekTotal} check-ins this week. {h.totalCompleted} all-time.
            </div>
          </div>
        </div>
        {h.habits.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            {h.habits.map((hb) => {
              const count = state!.checkins.filter((c) => c.habitId === hb.id).length;
              return (
                <div
                  key={hb.id}
                  onClick={() => open('habitcal', { habitId: hb.id })}
                  className="pressRow"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 4px', cursor: 'pointer' }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: `var(--${hb.color})`, flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{hb.name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{count} days</span>
                  <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}>
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    finances: (
      <div onClick={() => go('finances')} className="press99" style={cardB}>
        <div style={rowHead}>
          <span style={dot('emerald')} />
          <span style={title}>Finances</span>
          <span style={{ ...statRight, color: 'var(--emerald)' }}>{signMoney(d.net)}</span>
          <Arrow />
        </div>
        <div style={{ height: 96 }}>
          <Spark values={d.fTrend} colorKey="emerald" w={300} h={96} area sw={2.6} />
        </div>
        <div style={sub}>{money(d.income)} in · {money(d.spent)} out</div>
      </div>
    ),
    counters: (
      <div onClick={() => go('counters')} className="press99" style={cardB}>
        <div style={{ ...rowHead, marginBottom: 14 }}>
          <span style={dot('indigo')} />
          <span style={title}>Counters</span>
          <Arrow />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {d.counterRange.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={dot(c.color)} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{c.name}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{cNum(c.val)} {c.unit}</span>
            </div>
          ))}
        </div>
        <div style={sub}>{d.countLogsWin} logs {range === 'All' ? 'all time' : 'this ' + range.toLowerCase()}</div>
      </div>
    ),
  };

  const blockList = [
    ...(enabled(state!, 'workouts') ? ['workouts'] : []),
    ...(enabled(state!, 'sleep') ? ['sleep'] : []),
    ...(enabled(state!, 'habits') ? ['habits'] : []),
    ...(enabled(state!, 'finances') ? ['finances'] : []),
    ...(enabled(state!, 'counters') && state!.counters.length > 0 ? ['counters'] : []),
  ];
  const order = reconcile(parseLayout(profile.layout).analytics, blockList);
  const items = order.map((id) => ({ id, node: <div style={{ marginBottom: 14 }}>{blocks[id]}</div> }));
  const saveOrder = (ids: string[]) => {
    const next = { ...parseLayout(profile.layout), analytics: ids };
    mutate(() => api.updateMe({ layout: JSON.stringify(next) }));
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Analytics</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 2 }}>
          {range === 'All' ? 'Everything, all time' : 'Your ' + range.toLowerCase() + ' at a glance'}
        </div>
      </div>
      <RangeSeg />

      <div
        onClick={() => go('insights')}
        className="press99"
        role="button"
        aria-label="Open insights"
        style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'linear-gradient(140deg, color-mix(in srgb,var(--indigo) 16%,var(--surface)), color-mix(in srgb,var(--blue) 12%,var(--surface)))', border: '1px solid color-mix(in srgb,var(--indigo) 28%,var(--border))', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '15px 17px', marginBottom: 12, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden>🔍</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>Insights</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>
            How your sleep, training, habits and spending affect each other
          </div>
        </div>
        <Arrow />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {([['week', 'This week', 'indigo', '🗓️'], ['month', 'This month', 'coral', '🌙']] as const).map(([k, label, color, emoji]) => (
          <div
            key={k}
            onClick={() => openReport(k, 0)}
            className="press99"
            role="button"
            aria-label={`Open ${label} report`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, background: `color-mix(in srgb,var(--${color}) 14%,var(--surface))`, border: `1px solid color-mix(in srgb,var(--${color}) 30%,var(--border))`, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18 }} aria-hidden>{emoji}</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: `var(--${color})` }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {([['week', 'Last week', 'indigo'], ['month', 'Last month', 'coral'], ['year', 'Year in review', 'warning']] as const).map(([k, label, color]) => (
          <div
            key={k}
            onClick={() => openReport(k, k === 'year' ? 0 : 1)}
            className="pressRow"
            role="button"
            aria-label={`Open ${label} report`}
            style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, color: `var(--${color})`, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text2)', textAlign: 'center', margin: '2px 0 14px', opacity: 0.75 }}>
        Hold &amp; drag a card to rearrange
      </div>

      <Reorderable items={items} onReorder={saveOrder} />
    </div>
  );
}

const cardB: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: 'var(--shadow)',
  padding: 18,
  cursor: 'pointer',
};
const rowHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 };
const title: React.CSSProperties = { flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text)' };
const statRight: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };
const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 8 };
const dot = (k: string): React.CSSProperties => ({ width: 10, height: 10, borderRadius: 3, background: `var(--${k})`, flex: 'none' });
