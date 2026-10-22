import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { greeting, minutes, hm, money0, moneyShort, cNum, counterTotals, dayKey } from '../lib/format';
import { addDays, period, weekOfYear } from '../lib/period';
import { computeBadges } from '../lib/badges';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { BarChart } from '../lib/charts';
import { Avatar, SectionLabel } from '../ui';
import { IconWorkout, IconSleep, IconExpense } from '../icons';
import { enabled } from '../lib/modules';
import { Glyph } from '../lib/appIcons';
import { CIcon } from '../lib/iconPaths';
import { elapsed, formatElapsed } from '../lib/since';


/** ↑/↓ vs the previous week. `lowerIsBetter` flips the colour (e.g. spending). */
/**
 * The caption under a stat, with its week-on-week delta beside it.
 *
 * Wrapping matters more than it looks: the caption and the delta used to be
 * adjacent inline text with no break opportunity, so "this week↑1550%" behaved
 * as one unbreakable word and set a floor on how narrow the card could get.
 * On a small phone — or any phone with the in-app text size raised, which
 * shrinks the layout viewport — that floor pushed the right-hand column clean
 * off the screen. As a wrapping flex row the delta drops to its own line
 * instead.
 */
const subLabel: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text2)',
  marginTop: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  columnGap: 6,
  minWidth: 0,
};

function Delta({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      style={{ fontSize: 11.5, fontWeight: 700, color: good ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(pct)} percent vs last week`}
    >
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

const bigNum: React.CSSProperties = { fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', lineHeight: 1.05, whiteSpace: 'nowrap' };
const unit: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text2)', marginLeft: 1 };
const headBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', flex: 'none' };

export function Home() {
  const { state, go, mutate, mutateOpt, open, haptic, claimedBadges } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;
  const firstName = (profile.name || '').trim().split(/\s+/)[0] || '';
  const weekCaption = period('Week', 0).caption;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
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
    }, () => api.toggleHabit(id, key)).catch(() => {});
  };

  // ---- Never miss twice ----
  // The best-known habit-recovery mechanic: after ONE missed day, a gentle
  // nudge (with the user's own reason) so a slip doesn't become a spiral.
  const yesterday = addDays(Date.now(), -1);
  const yesterdayKey = dayKey(yesterday);
  const missedYesterday = todaysHabits.filter((hb) => {
    const dowY = new Date(yesterday).getDay();
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '4px 2px 10px' }}>
          <SectionLabel style={{ flex: 1, margin: 0 }}>Today</SectionLabel>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            {todaysHabits.length ? `${doneCount} of ${todaysHabits.length} done` : ''}
          </span>
        </div>
        {todaysHabits.length === 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '18px 16px', fontSize: 14, color: 'var(--text2)', textAlign: 'center' }}>
            Nothing scheduled today
          </div>
        )}
        <div style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', display: todaysHabits.length ? undefined : 'none' }}>
          {todaysHabits.map((hb) => {
            const col = `var(--${hb.color})`;
            return (
              <div key={hb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid var(--hairline)' }}>
                <div
                  onClick={() => toggleHabit(hb.id)}
                  role="checkbox"
                  aria-checked={hb.done}
                  aria-label={hb.name}
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
                <div onClick={() => toggleHabit(hb.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: hb.done ? 'var(--text2)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color .2s' }}>{hb.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 1 }}>
                    {hb.done ? 'Done for today' : hb.reminderTime ? `Reminder at ${hb.reminderTime}` : 'Not yet today'}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{hb.total}</span> {hb.total === 1 ? 'day' : 'days'}
                </div>
              </div>
            );
          })}
        </div>
      </>
    ),

    week: (
      <>
        <SectionLabel action={{ label: 'Analytics', onClick: () => go('analytics') }}>This week · {weekCaption}</SectionLabel>
        {/* auto-fit rather than a hard 1fr 1fr: below ~310px of usable width —
            a small phone, or any phone with the in-app text size turned up,
            which shrinks the layout viewport — two columns cannot hold their
            content and the right-hand cards used to run off the screen. This
            folds to a single column instead, with no media query, so it also
            reacts to `zoom` the way a media query would not. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10 }}>
          <StatCard onClick={() => go('workouts')} label="Workouts" iconKey="coral" icon={<IconWorkout c="var(--coral)" size={14} sw={2.1} />}>
            <div style={bigNum}>{d.homeWorkoutCount}</div>
            <div style={subLabel}>
              <span>{d.homeWorkoutCount === 1 ? 'session' : 'sessions'}</span>
              <Delta pct={d.deltas.workouts} />
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeWorkoutBuckets} color="coral" height={34} grid={false} interactive={false} format={(v) => minutes(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('sleep')} label="Sleep" iconKey="blue" icon={<IconSleep c="var(--blue)" size={14} sw={2.1} />}>
            <div style={bigNum}>
              {d.homeSleepData.length ? (
                <>
                  {Math.floor(d.homeSlAvg)}
                  <span style={unit}>h</span> {String(Math.round((d.homeSlAvg % 1) * 60)).padStart(2, '0')}
                  <span style={unit}>m</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div style={subLabel}>
              <span>a night</span>
              <Delta pct={d.deltas.sleep} />
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeSleepBuckets} color="blue" height={34} grid={false} interactive={false} max={10} format={(v) => hm(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('habits')} label="Habits" iconKey="teal" icon={<Glyph name="check" size={14} color="var(--teal)" sw={2.4} />}>
            <div style={bigNum}>
              {h.habitPct}
              <span style={unit}>%</span>
            </div>
            <div style={subLabel}>
              <span>{h.weekDone} of {h.weekTotal} so far</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={h.weekDaily} color="teal" height={34} grid={false} interactive={false} max={100} format={(v) => `${v}%`} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('finances')} label="Spent" iconKey="emerald" icon={<IconExpense c="var(--emerald)" size={14} sw={2.1} />}>
            <div style={{ ...bigNum, fontSize: d.homeWeekSpend >= 100000 ? 22 : 26 }}>{money0(d.homeWeekSpend)}</div>
            <div style={subLabel}>
              <span>this week</span>
              <Delta pct={d.deltas.spend} lowerIsBetter />
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeSpendBuckets} color="emerald" height={34} grid={false} interactive={false} format={(v) => moneyShort(v)} />
            </div>
          </StatCard>
        </div>
      </>
    ),

    milestones: (
      <>
        <SectionLabel>Counting since</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          {state!.milestones.map((m) => {
            const col = `var(--${m.color})`;
            const e = elapsed(new Date(`${m.since}T12:00:00`).getTime());
            return (
              <div
                key={m.id}
                onClick={() => open('milestone', m)}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', background: `color-mix(in srgb,${col} 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CIcon icon={m.icon} color={col} size={19} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{formatElapsed(e)}</div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{e.totalDays.toLocaleString()}</span> {e.totalDays === 1 ? 'day' : 'days'}
                </div>
              </div>
            );
          })}
          <div
            onClick={() => open('milestone')}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer' }}
          >
            <span style={{ width: 36, height: 36, borderRadius: 11, flex: 'none', background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>
                {state!.milestones.length ? 'Add another' : 'Count from a date'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                {state!.milestones.length ? 'Anything worth measuring' : 'Sober, vegan, together, born — anything'}
              </div>
            </div>
          </div>
        </div>
      </>
    ),
    counters: (
      <>
        <SectionLabel action={state!.counters.length ? { label: 'Open', onClick: () => go('counters') } : undefined}>
          {state!.counters.length ? `Counters · ${monthName}` : 'Counters'}
        </SectionLabel>
        <div
          onClick={() => go('counters')}
          className="press99"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', cursor: 'pointer', overflow: 'hidden' }}
        >
          {state!.counters.length ? (
            state!.counters.slice(0, 4).map((c) => {
              const t = counterTotals(state!.countLogs, c.id);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--hairline)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', background: `color-mix(in srgb,var(--${c.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CIcon icon={c.icon} color={`var(--${c.color})`} size={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                    {cNum(t.month)} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>{c.unit}</span>
                  </span>
                </div>
              );
            })
          ) : (
            // Empty state: nudge people to create their first counter.
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>Start a counter</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Water, pages, pull-ups — anything you count</div>
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
    'week',
    ...(enabled(state!, 'counters') ? ['counters'] : []),
    // Always offered: a milestone belongs to no tracker, and the empty state is
    // the invitation to make the first one.
    'milestones',
  ];
  const order = reconcile(parseLayout(profile.layout).home, blockList);
  const items = order.map((id) => ({ id, node: <div style={{ marginBottom: 22 }}>{blocks[id]}</div> }));
  const saveOrder = (ids: string[]) => {
    const next = { ...parseLayout(profile.layout), home: ids };
    mutate(() => api.updateMe({ layout: JSON.stringify(next) }));
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .4s ease' }}>
      {/* Date and controls on one row, the greeting on its own beneath them.
          Side by side, the greeting wrapped onto two lines on most phones. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · Week {weekOfYear(Date.now()).week}
        </div>
        <div
          onClick={() => go('search')}
          className="press96"
          role="button"
          aria-label="Search"
          style={headBtn}
        >
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l3 3" />
          </svg>
        </div>
        <div
          onClick={() => go('achievements')}
          className="press96"
          role="button"
          aria-label={`Achievements: ${badgeCount} of ${badges.length}${claimable ? `, ${claimable} new` : ''}`}
          style={{ ...headBtn, position: 'relative' }}
        >
          <Glyph name="trophy" size={18} color="var(--warning)" sw={2} />
          {claimable > 0 && (
            <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 99, background: 'var(--danger)', border: '2px solid var(--surface)' }} />
          )}
        </div>
        <Avatar name={profile.name} src={profile.avatar} size={38} onClick={() => go('settings')} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', marginBottom: 20, lineHeight: 1.15 }}>
        {greeting()}
        {firstName ? `, ${firstName}` : ''}
      </div>

      {nudge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRadius: 18, padding: '14px 14px 14px 16px', marginBottom: 22 }}>
          <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 11, background: `color-mix(in srgb,var(--${nudge.color}) 18%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="target" size={20} color={`var(--${nudge.color})`} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>Don’t miss {nudge.name} twice</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
              {nudge.why ? `“${nudge.why}”` : 'You missed it yesterday. One today keeps it going.'}
            </div>
          </div>
          <div
            onClick={() => toggleHabit(nudge.id)}
            className="press92"
            role="button"
            aria-label={`Check off ${nudge.name}`}
            style={{ flex: 'none', padding: '9px 14px', borderRadius: 999, background: `color-mix(in srgb,var(--${nudge.color}) 15%,transparent)`, color: `var(--${nudge.color})`, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Done
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

      <Reorderable items={items} onReorder={saveOrder} />
      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: -6 }}>Hold a section to move it</div>
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
    <div onClick={onClick} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: `color-mix(in srgb,var(--${iconKey}) 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
      </div>
      {children}
    </div>
  );
}
