import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Bars, Candles, Spark, Ring } from '../lib/charts';
import { hm, money, signMoney, cNum } from '../lib/format';
import { RangeSeg } from '../ui';

function Arrow() {
  return (
    <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', marginLeft: 4 }}>
      <path d="M7 4l5 5-5 5" />
    </svg>
  );
}

export function Analytics() {
  const { state, go, range } = useStore();
  const { d, h } = useData();

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Analytics</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 2 }}>
          {range === 'All' ? 'Everything, all time' : 'Your ' + range.toLowerCase() + ' at a glance'}
        </div>
      </div>
      <RangeSeg />

      <div onClick={() => go('workouts')} className="press99" style={card}>
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

      <div onClick={() => go('sleep')} className="press99" style={card}>
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

      <div onClick={() => go('habits')} className="press99" style={{ ...card, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 88, height: 88, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={h.habitPct} colorKey="teal" size={88} stroke={10} />
          <div style={{ position: 'absolute', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{h.habitPct}%</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...rowHead, marginBottom: 6 }}>
            <span style={dot('teal')} />
            <span style={title}>Habits</span>
            <Arrow />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            {h.totalDots} of {h.maxDots} check-ins this week. Longest streak: {h.longestStreak} days.
          </div>
        </div>
      </div>

      <div onClick={() => go('finances')} className="press99" style={{ ...card, marginBottom: 0 }}>
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

      {state!.counters.length > 0 && (
        <div onClick={() => go('counters')} className="press99" style={{ ...card, marginTop: 14, marginBottom: 0 }}>
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
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: 'var(--shadow)',
  padding: 18,
  marginBottom: 14,
  cursor: 'pointer',
};
const rowHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 };
const title: React.CSSProperties = { flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text)' };
const statRight: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };
const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 8 };
const dot = (k: string): React.CSSProperties => ({ width: 10, height: 10, borderRadius: 3, background: `var(--${k})`, flex: 'none' });
