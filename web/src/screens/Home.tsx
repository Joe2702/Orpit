import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { greeting, todayStr, money, cNum, counterTotals } from '../lib/format';
import { Bars, Spark, Ring } from '../lib/charts';
import { avatarInitial, SectionLabel } from '../ui';
import { IconWorkout, IconSleep, IconExpense, IconHabit } from '../icons';

function QuickAdd() {
  const { open } = useStore();
  const items = [
    { label: 'Workout', key: 'coral', icon: <IconWorkout />, sheet: 'workout' as const },
    { label: 'Sleep', key: 'blue', icon: <IconSleep />, sheet: 'sleep' as const },
    { label: 'Expense', key: 'emerald', icon: <IconExpense />, sheet: 'expense' as const },
    { label: 'Habit', key: 'teal', icon: <IconHabit />, sheet: 'habit' as const },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
      {items.map((it) => (
        <div
          key={it.label}
          onClick={() => open(it.sheet)}
          className="press96"
          style={{
            flex: 1,
            background: `color-mix(in srgb,var(--${it.key}) 11%,var(--surface))`,
            border: `1px solid color-mix(in srgb,var(--${it.key}) 16%,var(--border))`,
            borderRadius: 18,
            padding: '14px 6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 9,
            cursor: 'pointer',
          }}
        >
          {it.icon}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const { state, go, mutate, open } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;
  const doneCount = h.habits.filter((x) => x.done).length;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: '.01em' }}>{todayStr()}</div>
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', marginTop: 3, color: 'var(--text)' }}>
            {greeting()}
          </div>
        </div>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 17 }}>
          {avatarInitial(profile.name)}
        </div>
      </div>

      <SectionLabel style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ whiteSpace: 'nowrap' }}>Today's habits</span>
        <span style={{ color: 'var(--text2)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
          {doneCount} of {h.habits.length} done
        </span>
      </SectionLabel>

      <div style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 28 }}>
        {h.habits.map((hb) => {
          const col = `var(--${hb.color})`;
          return (
            <div key={hb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => mutate(() => api.toggleHabit(hb.id))}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all .3s cubic-bezier(.34,1.56,.64,1)',
                  border: `2px solid ${hb.done ? col : 'var(--border)'}`,
                  background: hb.done ? col : 'transparent',
                  boxShadow: hb.done ? `0 5px 14px -3px color-mix(in srgb,${col} 50%,transparent)` : 'none',
                }}
              >
                <svg
                  width="17"
                  height="17"
                  style={{
                    fill: 'none',
                    stroke: '#fff',
                    strokeWidth: 2.6,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    transition: 'all .3s cubic-bezier(.34,1.56,.64,1)',
                    transform: hb.done ? 'scale(1)' : 'scale(.2)',
                    opacity: hb.done ? 1 : 0,
                  }}
                >
                  <path d="M4 9l3.2 3.2L13.5 5.5" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{hb.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                  {hb.done ? 'Completed today' : 'Tap to complete'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 999, flex: 'none', background: `color-mix(in srgb,${col} 13%,transparent)`, color: col }}>
                {hb.streak}
                <span style={{ opacity: 0.55, fontWeight: 600, marginLeft: 1 }}>d</span>
              </div>
            </div>
          );
        })}
      </div>

      <SectionLabel>Quick add</SectionLabel>
      <QuickAdd />

      <SectionLabel>This week</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatCard onClick={() => go('workouts')} label="Workouts" iconKey="coral" icon={<IconWorkout c="var(--coral)" size={14} sw={2.1} />}>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>{d.homeWorkoutCount}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>sessions this week</div>
          <div style={{ height: 42, marginTop: 4 }}>
            <Bars values={d.homeWorkoutSeries} colorKey="coral" />
          </div>
        </StatCard>

        <StatCard onClick={() => go('sleep')} label="Avg sleep" iconKey="blue" icon={<IconSleep c="var(--blue)" size={14} sw={2.1} />}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>
            {Math.floor(d.homeSlAvg)}<span style={{ fontSize: 20, fontWeight: 600 }}>h</span>{' '}
            {String(Math.round((d.homeSlAvg % 1) * 60)).padStart(2, '0')}<span style={{ fontSize: 20, fontWeight: 600 }}>m</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>nightly average</div>
          <div style={{ height: 42, marginTop: 4 }}>
            <Spark values={d.homeSleepData.length > 1 ? d.homeSleepData : [0, 0]} colorKey="blue" />
          </div>
        </StatCard>

        <div onClick={() => go('habits')} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>Habits</span>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>
              {h.habitPct}<span style={{ fontSize: 20, fontWeight: 600 }}>%</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>completion</div>
          </div>
          <div style={{ position: 'relative', width: 56, height: 56, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ring pct={h.habitPct} colorKey="teal" size={56} stroke={7} />
          </div>
        </div>

        <StatCard onClick={() => go('finances')} label="Spent" iconKey="emerald" icon={<IconExpense c="var(--emerald)" size={14} sw={2.1} />}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>
            {money(d.homeWeekSpend)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>this week</div>
          <div style={{ height: 42, marginTop: 4 }}>
            <Spark values={d.homeSpendSeries.map((v) => v || 0.001)} colorKey="emerald" />
          </div>
        </StatCard>

        {state!.counters.length > 0 && (
          <div
            onClick={() => go('counters')}
            className="press99"
            style={{ gridColumn: '1 / -1', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: 8, background: 'color-mix(in srgb,var(--indigo) 14%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M5 3l-.8 8M9 3l-.8 8M3 6h8M2.5 9h8" />
                </svg>
              </span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>Counters · this month</span>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M7 4l5 5-5 5" /></svg>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {state!.counters.slice(0, 3).map((c) => {
                const t = counterTotals(state!.countLogs, c.id);
                return (
                  <div key={c.id} style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '11px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: `var(--${c.color})` }} />
                      <span style={{ fontSize: 11.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{cNum(t.month)} {c.unit}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  onClick,
  label,
  iconKey,
  icon,
  children,
}: {
  onClick: () => void;
  label: string;
  iconKey: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div onClick={onClick} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: `color-mix(in srgb,var(--${iconKey}) 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
      </div>
      {children}
    </div>
  );
}
