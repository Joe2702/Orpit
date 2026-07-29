import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { greeting, todayStr, weekOfYear, money, cNum, counterTotals, dayKey } from '../lib/format';
import { computeBadges } from '../lib/badges';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { Bars, Spark, Ring } from '../lib/charts';
import { Avatar, SectionLabel } from '../ui';
import { IconWorkout, IconSleep, IconExpense, IconHabit } from '../icons';
import { enabled } from '../lib/modules';

function QuickAdd() {
  const { open } = useStore();
  const items = [
    { label: 'Workout', key: 'coral', icon: <IconWorkout />, sheet: 'workout' as const },
    { label: 'Sleep', key: 'blue', icon: <IconSleep />, sheet: 'sleep' as const },
    { label: 'Expense', key: 'emerald', icon: <IconExpense />, sheet: 'expense' as const },
    { label: 'Habit', key: 'teal', icon: <IconHabit />, sheet: 'habit' as const },
  ];
  return (
    <div style={{ display: 'flex', gap: 10 }}>
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


/** ↑/↓ vs the previous week. `lowerIsBetter` flips the colour (e.g. spending). */
function Delta({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      style={{ fontSize: 11.5, fontWeight: 700, color: good ? 'var(--success)' : 'var(--danger)', marginLeft: 6, whiteSpace: 'nowrap' }}
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(pct)} percent vs last week`}
    >
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

export function Home() {
  const { state, go, mutate, mutateOpt, open, haptic, claimedBadges } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;
  // Only show habits scheduled for today's weekday (Sun=0 … Sat=6).
  const dow = new Date().getDay();
  const todaysHabits = h.habits.filter((hb) => !hb.paused && (hb.days || '1111111')[dow] === '1');
  const doneCount = todaysHabits.filter((x) => x.done).length;
  const badges = computeBadges(state!);
  const badgeCount = badges.filter((b) => b.unlocked).length;
  // Earned-but-not-yet-claimed badges — shown as a red count on the trophy.
  const claimable = badges.filter((b) => b.unlocked && !claimedBadges.includes(b.id)).length;

  // Flip the checkbox instantly, then sync with the server in the background.
  // mutateOpt computes each toggle from the latest state and orders the server
  // responses, so mashing several habits quickly stays visually stable.
  const toggleHabit = (id: string) => {
    const key = dayKey();
    haptic();
    mutateOpt((s) => {
      const has = s.checkins.some((c) => c.habitId === id && c.day === key);
      return {
        ...s,
        checkins: has
          ? s.checkins.filter((c) => !(c.habitId === id && c.day === key))
          : [...s.checkins, { habitId: id, day: key }],
      };
    }, () => api.toggleHabit(id)).catch(() => {});
  };

  // ---- Never miss twice ----
  // The best-known habit-recovery mechanic: after ONE missed day, a gentle
  // nudge (with the user's own reason) so a slip doesn't become a spiral.
  const yesterdayKey = dayKey(Date.now() - 86400000);
  const missedYesterday = todaysHabits.filter((hb) => {
    const dowY = new Date(Date.now() - 86400000).getDay();
    const scheduledY = (hb.days || '1111111')[dowY] === '1';
    if (!scheduledY || hb.done) return false;
    return !state!.checkins.some((c) => c.habitId === hb.id && c.day === yesterdayKey);
  });
  const nudge = missedYesterday[0];

  // ---- Getting started ----
  // A brand-new account has empty charts everywhere, which feels like a void.
  // This gives immediate, visible progress (the first step is already done just
  // by signing up) and disappears for good once every step is complete.
  const steps = [
    { label: 'Create your account', done: true },
    { label: 'Check off a habit', done: state!.checkins.length > 0 },
    { label: 'Log a workout or a night of sleep', done: state!.workouts.length > 0 || state!.nights.length > 0 },
    { label: 'Add your first transaction', done: state!.txns.length > 0 },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const showChecklist = stepsDone < steps.length;

  // ---- Movable dashboard blocks ----
  const blocks: Record<string, React.ReactNode> = {
    habits: (
      <>
        <SectionLabel style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Today's habits</span>
          <span style={{ color: 'var(--text2)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
            {doneCount} of {todaysHabits.length} done
          </span>
        </SectionLabel>
        <div style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          {todaysHabits.map((hb) => {
            const col = `var(--${hb.color})`;
            return (
              <div key={hb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderBottom: '1px solid var(--border)' }}>
                <div
                  onClick={() => toggleHabit(hb.id)}
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
                  {hb.total}
                  <span style={{ opacity: 0.55, fontWeight: 600, marginLeft: 2 }}>days</span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    ),

    quick: (
      <>
        <SectionLabel>Quick add</SectionLabel>
        <QuickAdd />
      </>
    ),

    week: (
      <>
        <SectionLabel>This week</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatCard onClick={() => go('workouts')} label="Workouts" iconKey="coral" icon={<IconWorkout c="var(--coral)" size={14} sw={2.1} />}>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>{d.homeWorkoutCount}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>
              sessions this week<Delta pct={d.deltas.workouts} />
            </div>
            <div style={{ height: 42, marginTop: 4 }}>
              <Bars values={d.homeWorkoutSeries} colorKey="coral" />
            </div>
          </StatCard>

          <StatCard onClick={() => go('sleep')} label="Avg sleep" iconKey="blue" icon={<IconSleep c="var(--blue)" size={14} sw={2.1} />}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>
              {Math.floor(d.homeSlAvg)}<span style={{ fontSize: 20, fontWeight: 600 }}>h</span>{' '}
              {String(Math.round((d.homeSlAvg % 1) * 60)).padStart(2, '0')}<span style={{ fontSize: 20, fontWeight: 600 }}>m</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>
              nightly average<Delta pct={d.deltas.sleep} />
            </div>
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
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>
                completion<Delta pct={d.deltas.habits} />
              </div>
            </div>
            <div style={{ position: 'relative', width: 56, height: 56, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ring pct={h.habitPct} colorKey="teal" size={56} stroke={7} />
            </div>
          </div>

          <StatCard onClick={() => go('finances')} label="Spent" iconKey="emerald" icon={<IconExpense c="var(--emerald)" size={14} sw={2.1} />}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05 }}>
              {money(d.homeWeekSpend)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: -2 }}>
              this week<Delta pct={d.deltas.spend} lowerIsBetter />
            </div>
            <div style={{ height: 42, marginTop: 4 }}>
              <Spark values={d.homeSpendSeries.map((v) => v || 0.001)} colorKey="emerald" />
            </div>
          </StatCard>
        </div>
      </>
    ),

    counters: (
      <>
        <SectionLabel>Counters</SectionLabel>
        <div
          onClick={() => go('counters')}
          className="press99"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: 'color-mix(in srgb,var(--indigo) 14%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M5 3l-.8 8M9 3l-.8 8M3 6h8M2.5 9h8" />
              </svg>
            </span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>
              {state!.counters.length ? 'Counters · this month' : 'Counters'}
            </span>
            <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M7 4l5 5-5 5" /></svg>
          </div>
          {state!.counters.length ? (
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
          ) : (
            // Empty state: nudge people to create their first counter.
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', border: '1px dashed color-mix(in srgb,var(--indigo) 32%,var(--border))', borderRadius: 14, padding: '13px 14px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Start a counter</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>Track water, steps, pages — anything you want to count.</div>
              </div>
            </div>
          )}
        </div>
      </>
    ),
  };

  // Respect the trackers the user chose to see.
  const blockList = [
    ...(enabled(state!, 'habits') ? ['habits'] : []),
    'quick',
    'week',
    ...(enabled(state!, 'counters') ? ['counters'] : []),
  ];
  const order = reconcile(parseLayout(profile.layout).home, blockList);
  const items = order.map((id) => ({ id, node: <div style={{ marginBottom: 22 }}>{blocks[id]}</div> }));
  const saveOrder = (ids: string[]) => {
    const next = { ...parseLayout(profile.layout), home: ids };
    mutate(() => api.updateMe({ layout: JSON.stringify(next) }));
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: '.01em' }}>
            {todayStr()} · Week {weekOfYear()} of 52
          </div>
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', marginTop: 3, color: 'var(--text)' }}>
            {greeting()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={() => go('search')}
            className="press96"
            role="button"
            aria-label="Search"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', boxShadow: 'var(--shadow)' }}
          >
            <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M13 13l3 3" />
            </svg>
          </div>
          <div
            onClick={() => go('achievements')}
            className="press96"
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 11px', cursor: 'pointer', boxShadow: 'var(--shadow)' }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>🏆</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {badgeCount}<span style={{ color: 'var(--text2)', fontWeight: 600 }}>/{badges.length}</span>
            </span>
            {claimable > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--app-bg)', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }}>
                {claimable}
              </span>
            )}
          </div>
          <Avatar name={profile.name} src={profile.avatar} size={46} onClick={() => go('settings')} />
        </div>
      </div>

      {nudge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: `color-mix(in srgb,var(--${nudge.color}) 12%,var(--surface))`, border: `1px solid color-mix(in srgb,var(--${nudge.color}) 30%,var(--border))`, borderRadius: 18, padding: '14px 16px', marginBottom: 16 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>🎯</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
              Don't miss "{nudge.name}" twice
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
              {nudge.why ? `"${nudge.why}"` : 'You skipped it yesterday — one tap today keeps it alive.'}
            </div>
          </div>
          <div
            onClick={() => toggleHabit(nudge.id)}
            className="press92"
            role="button"
            aria-label={`Check off ${nudge.name}`}
            style={{ flex: 'none', padding: '9px 14px', borderRadius: 999, background: `var(--${nudge.color})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Do it
          </div>
        </div>
      )}

      {showChecklist && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Getting started</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--indigo)' }}>{stepsDone} of {steps.length}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ width: `${(stepsDone / steps.length) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--indigo)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {steps.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{ width: 19, height: 19, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? 'var(--indigo)' : 'transparent', border: `1.5px solid ${s.done ? 'var(--indigo)' : 'var(--border)'}` }}
                >
                  {s.done && (
                    <svg width="11" height="11" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                      <path d="M2.5 5.8l2.2 2.2L9 3.4" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 13.5, color: s.done ? 'var(--text2)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text2)', textAlign: 'center', marginBottom: 14, opacity: 0.75 }}>
        Hold &amp; drag a section to rearrange
      </div>

      <Reorderable items={items} onReorder={saveOrder} />
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
