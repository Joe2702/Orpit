import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { BarChart, Ring } from '../lib/charts';
import { hm, minutes, money0, moneyShort, cNum } from '../lib/format';
import { period } from '../lib/period';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { RangeSeg, SectionLabel } from '../ui';
import { enabled } from '../lib/modules';
import { Glyph, type GlyphName } from '../lib/appIcons';

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}>
      <path d="M7 4l5 5-5 5" />
    </svg>
  );
}

/** Tracker card heading: the whole row opens the tracker; the chart below stays tappable on its own. */
function Head({ color, title, value, onClick }: { color: string; title: string; value?: React.ReactNode; onClick: () => void }) {
  return (
    <div onClick={onClick} role="button" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
      <span style={dot(color)} />
      <span style={title_}>{title}</span>
      {value != null && <span style={statRight}>{value}</span>}
      <Arrow />
    </div>
  );
}

export function Analytics() {
  const { state, go, mutate, open, openReport } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;
  const P = d.period;

  const blocks: Record<string, React.ReactNode> = {
    workouts: (
      <div style={cardB}>
        <Head color="coral" title="Workouts" value={d.wTotalMin ? minutes(d.wTotalMin) : '—'} onClick={() => go('workouts')} />
        <BarChart buckets={d.buckets} values={d.wMinBuckets} color="coral" height={88} grid={false} format={(v) => minutes(v)} />
        <div style={sub}>
          {d.wCount} {d.wCount === 1 ? 'session' : 'sessions'} · {d.wActiveDays} active {d.wActiveDays === 1 ? 'day' : 'days'}
        </div>
      </div>
    ),
    sleep: (
      <div style={cardB}>
        <Head color="blue" title="Sleep" value={d.slNights ? hm(d.slAvg) : '—'} onClick={() => go('sleep')} />
        <BarChart buckets={d.buckets} values={d.slSeries} color="blue" height={88} grid={false} max={10} band={[7, 9]} format={(v) => hm(v)} />
        <div style={sub}>
          {d.slNights ? `${d.slNights} ${d.slNights === 1 ? 'night' : 'nights'} · quality ${d.slAvgQ.toFixed(1)}/10` : `No nights logged ${P.phrase}`}
        </div>
      </div>
    ),
    habits: (
      <div style={cardB}>
        <div onClick={() => go('habits')} role="button" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
          <div style={{ position: 'relative', width: 64, height: 64, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ring pct={h.rangePct} colorKey="teal" size={64} stroke={7} />
            <div style={{ position: 'absolute', fontSize: 15, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{h.rangePct}%</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={dot('teal')} />
              <span style={title_}>Habits</span>
              <Arrow />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
              {h.rangeTotal ? `${h.rangeDone} of ${h.rangeTotal} check-ins ${P.phrase}` : `Nothing scheduled ${P.phrase}`}
            </div>
          </div>
        </div>
        {h.habits.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)' }}>
            {h.habits.map((hb) => {
              const r = h.rangeByHabit[hb.id];
              const pct = r && r.scheduled ? Math.round((r.done / r.scheduled) * 100) : 0;
              return (
                <div
                  key={hb.id}
                  onClick={() => open('habitcal', { habitId: hb.id })}
                  className="pressRow"
                  role="button"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 2px', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${hb.color})`, flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 550, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hb.name}</span>
                  <span style={{ width: 54, height: 5, borderRadius: 3, background: 'var(--hairline)', overflow: 'hidden', flex: 'none' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: `var(--${hb.color})`, borderRadius: 3 }} />
                  </span>
                  <span style={{ width: 66, textAlign: 'right', fontSize: 12.5, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                    {r ? `${r.done}/${r.scheduled}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    finances: (
      <div style={cardB}>
        <Head
          color="emerald"
          title="Finances"
          value={<span style={{ color: d.net > 0 ? 'var(--emerald)' : d.net < 0 ? 'var(--danger)' : 'var(--text)' }}>{(d.net >= 0 ? '+' : '−') + money0(d.net)}</span>}
          onClick={() => go('finances')}
        />
        <BarChart buckets={d.buckets} values={d.spendBuckets} color="emerald" height={88} grid={false} format={(v) => moneyShort(v)} />
        <div style={sub}>
          {money0(d.income)} in · {money0(d.spent)} out
        </div>
      </div>
    ),
    counters: (
      <div style={cardB}>
        <Head color="indigo" title="Counters" onClick={() => go('counters')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {d.counterRange.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${c.color})`, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                {cNum(c.val)} <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{c.unit}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={sub}>
          {d.countLogsWin} {d.countLogsWin === 1 ? 'entry' : 'entries'} {P.phrase}
        </div>
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
  const items = order.map((id) => ({ id, node: <div style={{ marginBottom: 12 }}>{blocks[id]}</div> }));
  const saveOrder = (ids: string[]) => {
    const next = { ...parseLayout(profile.layout), analytics: ids };
    mutate(() => api.updateMe({ layout: JSON.stringify(next) }));
  };

  // Reports name the period they cover, so "Last month" says which month.
  const now = new Date();
  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  const lastWeek = period('Week', 1);
  const reports: { label: string; note: string; icon: GlyphName; color: string; run: () => void }[] = [
    { label: 'This week so far', note: period('Week', 0).caption, icon: 'calendar', color: 'indigo', run: () => openReport('week', 0) },
    { label: 'Last week', note: lastWeek.caption, icon: 'calendar', color: 'indigo', run: () => openReport('week', 1) },
    { label: 'Last month', note: lastMonthName, icon: 'moon', color: 'coral', run: () => openReport('month', 1) },
    { label: 'Year in review', note: `${now.getFullYear()} so far`, icon: 'star', color: 'amber', run: () => openReport('year', 0) },
  ];

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)' }}>Analytics</div>
      </div>
      <RangeSeg period={P} />

      <Reorderable items={items} onReorder={saveOrder} />

      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', margin: '2px 0 22px' }}>Hold a card to move it</div>

      <SectionLabel>Look closer</SectionLabel>
      <div style={{ ...cardB, padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div onClick={() => go('insights')} className="pressRow" role="button" aria-label="Open insights" style={rowS}>
          <span style={iconBox('purple')}>
            <Glyph name="search" size={18} color="var(--purple)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={rowTitle}>Insights</div>
            <div style={rowNote}>How your trackers affect each other</div>
          </div>
          <Arrow />
        </div>
        {reports.map((r) => (
          <div key={r.label} onClick={r.run} className="pressRow" role="button" aria-label={`Open ${r.label} report`} style={rowS}>
            <span style={iconBox(r.color)}>
              <Glyph name={r.icon} size={18} color={`var(--${r.color})`} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={rowTitle}>{r.label}</div>
              <div style={rowNote}>{r.note}</div>
            </div>
            <Arrow />
          </div>
        ))}
      </div>
    </div>
  );
}

const cardB: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: 'var(--shadow)',
  padding: '16px 18px',
};
const title_: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--text)' };
const statRight: React.CSSProperties = { fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };
const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 12 };
const dot = (k: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: 3, background: `var(--${k})`, flex: 'none' });
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' };
const rowTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--text)' };
const rowNote: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const iconBox = (k: string): React.CSSProperties => ({ width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,var(--${k}) 13%,transparent)` });
