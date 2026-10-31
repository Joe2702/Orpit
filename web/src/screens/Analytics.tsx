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
import { t, tData, tn, yearStr } from '../i18n';

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}>
      <path className="flip-rtl" d="M7 4l5 5-5 5" />
    </svg>
  );
}

/** Tracker card heading: the whole row opens the tracker; the chart below stays tappable on its own. */
function Head({ title, value, onClick }: { title: string; value?: React.ReactNode; onClick: () => void }) {
  return (
    <div tabIndex={0} onClick={onClick} role="button" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
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
        <Head title={t('Workouts')} value={d.wTotalMin ? minutes(d.wTotalMin) : '—'} onClick={() => go('workouts')} />
        <BarChart buckets={d.buckets} values={d.wMinBuckets} color="indigo" height={88} grid={false} format={(v) => minutes(v)} />
        <div style={sub}>
          {tn(d.wCount, '{n} session', '{n} sessions')} · {tn(d.wActiveDays, '{n} active day', '{n} active days')}
        </div>
      </div>
    ),
    sleep: (
      <div style={cardB}>
        <Head title={t('Sleep')} value={d.slNights ? hm(d.slAvg) : '—'} onClick={() => go('sleep')} />
        <BarChart buckets={d.buckets} values={d.slSeries} color="indigo" height={88} grid={false} max={10} band={[7, 9]} format={(v) => hm(v)} />
        <div style={sub}>
          {d.slNights ? `${tn(d.slNights, '{n} night', '{n} nights')} · ${t('quality {q}/10', { q: d.slAvgQ.toFixed(1) })}` : t('No nights logged {phrase}', { phrase: P.phrase })}
        </div>
      </div>
    ),
    habits: (
      <div style={cardB}>
        <div tabIndex={0} onClick={() => go('habits')} role="button" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
          <div style={{ position: 'relative', width: 64, height: 64, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ring pct={h.rangePct} colorKey="indigo" size={64} stroke={7} />
            <div style={{ position: 'absolute', fontSize: 15, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{h.rangePct}%</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={title_}>{t('Habits')}</span>
              <Arrow />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
              {h.rangeTotal ? t('{rangeDone} of {rangeTotal} check-ins {phrase}', { rangeDone: h.rangeDone, rangeTotal: h.rangeTotal, phrase: P.phrase }) : t('Nothing scheduled {phrase}', { phrase: P.phrase })}
            </div>
          </div>
        </div>
        {h.habits.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)' }}>
            {h.habits.map((hb) => {
              const r = h.rangeByHabit[hb.id];
              const pct = r && r.scheduled ? Math.round((r.done / r.scheduled) * 100) : 0;
              return (
                <div tabIndex={0}
                  key={hb.id}
                  onClick={() => open('habitcal', { habitId: hb.id })}
                  className="pressRow"
                  role="button"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 2px', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${hb.color})`, flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 550, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tData(hb.name)}</span>
                  <span style={{ flex: '0 1 54px', minWidth: 20, height: 5, borderRadius: 3, background: 'var(--hairline)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--indigo)', borderRadius: 3 }} />
                  </span>
                  <span style={{ minWidth: 44, textAlign: 'end', fontSize: 12.5, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
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
          title={t('Finances')}
          value={<span style={{ color: d.net < 0 ? 'var(--danger)' : 'var(--text)' }}>{(d.net >= 0 ? '+' : '−') + money0(d.net)}</span>}
          onClick={() => go('finances')}
        />
        <BarChart
          buckets={d.buckets}
          values={d.spendBuckets}
          color="indigo"
          height={88}
          grid={false}
          format={(v) => moneyShort(v)}
          onOpen={(i) => go('ftxns', { focus: { title: d.buckets[i].name, start: d.buckets[i].start, end: d.buckets[i].end } })}
        />
        <div style={sub}>
          {t('{amount} in · {amount2} out', { amount: money0(d.income), amount2: money0(d.spent) })}</div>
      </div>
    ),
    counters: (
      <div style={cardB}>
        <Head title={t('Counters')} onClick={() => go('counters')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {d.counterRange.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tData(c.name)}</span>
              <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                {cNum(c.val)} <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{c.unit}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={sub}>
          {tn(d.countLogsWin, '{n} entry {phrase}', '{n} entries {phrase}', { phrase: P.phrase })}
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
  const reports: { label: string; note: string; icon: GlyphName; run: () => void }[] = [
    { label: t('This week so far'), note: period('Week', 0).caption, icon: 'calendar', run: () => openReport('week', 0) },
    { label: t('Last week'), note: lastWeek.caption, icon: 'calendar', run: () => openReport('week', 1) },
    { label: t('Last month'), note: lastMonthName, icon: 'moon', run: () => openReport('month', 1) },
    { label: t('Year in review'), note: t('{year} so far', { year: yearStr(now.getFullYear()) }), icon: 'star', run: () => openReport('year', 0) },
  ];

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--text)' }}>{t('Analytics')}</div>
      </div>
      <RangeSeg period={P} />

      <Reorderable items={items} onReorder={saveOrder} />

      <div style={{ height: 14 }} />

      <SectionLabel>{t('Look back')}</SectionLabel>
      <div style={{ ...cardB, padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div tabIndex={0} onClick={() => go('insights')} className="pressRow" role="button" aria-label={t('Open insights')} style={rowS}>
          <span style={iconBox}>
            <Glyph name="search" size={19} color="var(--text2)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={rowTitle}>{t('Insights')}</div>
            <div style={{ ...rowNote, whiteSpace: 'normal' }}>{t('How your trackers affect each other')}</div>
          </div>
          <Arrow />
        </div>
        {reports.map((r) => (
          <div tabIndex={0} key={r.label} onClick={r.run} className="pressRow" role="button" aria-label={t('Open {label} report', { label: r.label })} style={rowS}>
            <span style={iconBox}>
              <Glyph name={r.icon} size={19} color="var(--text2)" />
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
  borderRadius: 'calc(20px * var(--sq))',
  boxShadow: 'var(--shadow)',
  padding: '16px 18px',
};
const title_: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--text)' };
const statRight: React.CSSProperties = { fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };
const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 12 };
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' };
const rowTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--text)' };
const rowNote: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const iconBox: React.CSSProperties = { width: 24, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };
