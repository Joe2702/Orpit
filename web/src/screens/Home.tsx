import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { greeting, minutes, hm, money0, moneyShort, cNum, counterTotals, dayKey, relLabel } from '../lib/format';
import { missedRun } from '../lib/comeback';
import { reviewDue, currentIntention } from '../lib/weekReview';
import { period } from '../lib/period';
import { freshStart } from '../lib/freshStart';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { BarChart } from '../lib/charts';
import { Avatar, SectionLabel } from '../ui';
import { enabled } from '../lib/modules';
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
      style={{ fontSize: 11.5, fontWeight: 700, color: good ? 'var(--text2)' : 'var(--danger)', whiteSpace: 'nowrap' }}
      aria-label={`${up ? 'up' : 'down'} ${Math.abs(pct)} percent vs last week`}
    >
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

const bigNum: React.CSSProperties = { fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', lineHeight: 1.05, whiteSpace: 'nowrap' };
const unit: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text2)', marginLeft: 1 };
const listCard: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' };
const iconCell: React.CSSProperties = { width: 24, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const headBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', flex: 'none' };

const FRESH_KEY = 'orbit_fresh_dismissed';

/** Today's fresh-start card, if there is one and it hasn't been dismissed. */
function useFreshStart(openReport: (k: 'week' | 'month' | 'year', offset?: number) => void) {
  const { state } = useStore();
  const [dismissed, setDismissed] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(FRESH_KEY);
    } catch {
      return null;
    }
  });
  const f = React.useMemo(() => (state ? freshStart(state) : null), [state]);
  if (!f || f.key === dismissed) return null;
  return {
    ...f,
    run: () => openReport(f.kind, 1),
    dismiss: () => {
      try {
        localStorage.setItem(FRESH_KEY, f.key);
      } catch {
        /* private mode: it just comes back next launch */
      }
      setDismissed(f.key);
    },
  };
}

export function Home() {
  const { state, go, mutate, mutateOpt, open, haptic, openReport } = useStore();
  const { d, h } = useData();
  const profile = state!.profile;
  const firstName = (profile.name || '').trim().split(/\s+/)[0] || '';
  const weekCaption = period('Week', 0).caption;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  // Only show habits scheduled for today's weekday (Sun=0 … Sat=6).
  const dow = new Date().getDay();
  const todaysHabits = h.habits.filter((hb) => !hb.paused && (hb.days || '1111111')[dow] === '1');
  const doneCount = todaysHabits.filter((x) => x.done).length;
  const allDone = todaysHabits.length > 0 && doneCount === todaysHabits.length;

  // ---- Fresh start ----
  // People take up goals at temporal landmarks: a new week, a new month (Dai,
  // Milkman & Riis, "The Fresh Start Effect", 2014). Those are the days to look
  // back once and set the next stretch up, so the card appears then, and only
  // then, and stays dismissed for that period.
  const fresh = useFreshStart(openReport);
  const dismissFresh = () => fresh && fresh.dismiss();

  // Flip the checkbox instantly, then sync with the server in the background.
  // mutateOpt computes each toggle from the latest state and orders the server
  // responses, so mashing several habits quickly stays visually stable.
  const toggleHabit = (id: string) => {
    const key = dayKey();
    const target = todaysHabits.find((x) => x.id === id);
    // Finishing the list gets its own, longer buzz: closing the day's last
    // open loop is the moment worth marking.
    const finishing = !!target && !target.done && doneCount === todaysHabits.length - 1;
    haptic(finishing ? [14, 70, 28] : 12);
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

  // ---- The weekly review, and the one thing chosen in it ----
  const weekDue = reviewDue() && (state!.txns.length > 0 || state!.checkins.length > 0);
  const intention = currentIntention();

  // ---- Never miss twice, and coming back ----
  // After one missed day, a gentle nudge (with the user's own reason) so a slip
  // doesn't become a spiral. After a longer gap the habit has lapsed, and
  // "you missed it yesterday" would be both untrue and beside the point: what
  // helps then is a smaller first step, not a count of what was lost.
  const todayKey = dayKey();
  const nudge = todaysHabits
    .filter((hb) => !hb.done)
    .map((hb) => {
      const done = new Set(state!.checkins.filter((c) => c.habitId === hb.id).map((c) => c.day));
      const last = [...done].filter((d) => d < todayKey).sort().pop() || null;
      return { ...hb, missed: missedRun(hb.days, done), last };
    })
    .filter((hb) => hb.missed > 0)
    .sort((a, b) => a.missed - b.missed)[0];

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
        <SectionLabel action={todaysHabits.length ? { label: `${doneCount} of ${todaysHabits.length}`, onClick: () => go('habits') } : undefined}>Today</SectionLabel>
        {todaysHabits.length === 0 ? (
          <div style={{ ...listCard, padding: '18px 16px', fontSize: 14, color: 'var(--text2)', textAlign: 'center' }}>Nothing scheduled today</div>
        ) : (
          <div style={listCard}>
            {/* Progress across the day's list. Effort rises as a goal gets
                close (the goal-gradient effect), so the bar is the nudge. */}
            <div style={{ height: 3, background: 'var(--hairline)' }}>
              <div style={{ height: '100%', width: `${(doneCount / todaysHabits.length) * 100}%`, background: 'var(--indigo)', transition: 'width .45s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            {allDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--hairline)', animation: 'fadeIn .3s ease' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}>
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Today’s list is done.</span>
              </div>
            )}
            {todaysHabits.map((hb) => (
              <div tabIndex={0} key={hb.id} onClick={() => toggleHabit(hb.id)} role="checkbox" aria-checked={hb.done} aria-label={hb.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background .25s, border-color .25s',
                    border: `1.5px solid ${hb.done ? 'var(--indigo)' : 'var(--text3)'}`,
                    background: hb.done ? 'var(--indigo)' : 'transparent',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 18 18"
                    aria-hidden
                    style={{
                      fill: 'none',
                      stroke: 'var(--surface)',
                      strokeWidth: 2.6,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      transition: 'transform .3s cubic-bezier(.34,1.56,.64,1), opacity .2s',
                      transform: hb.done ? 'scale(1)' : 'scale(.3)',
                      opacity: hb.done ? 1 : 0,
                    }}
                  >
                    <path d="M4 9l3.2 3.2L13.5 5.5" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 550, color: hb.done ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color .2s' }}>{hb.name}</div>
                  {/* The plan the user wrote ("after my morning coffee") is the
                      most useful thing to read at the moment of doing it. */}
                  {(hb.cue || hb.reminderTime) && !hb.done && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hb.cue || `Reminder at ${hb.reminderTime}`}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text3)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{hb.total}</div>
              </div>
            ))}
            <div style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text2)' }}>
              {h.weekPlanned === 0
                ? 'Nothing else planned this week.'
                : h.weekSecured
                ? 'This week already counts. Anything more is extra.'
                : `${h.weekToGo} more ${h.weekToGo === 1 ? 'check-in' : 'check-ins'} and this week counts.`}
            </div>
          </div>
        )}
      </>
    ),

    week: (
      <>
        <SectionLabel action={{ label: weekCaption, onClick: () => go('analytics') }}>This week</SectionLabel>
        {/* auto-fit rather than a hard 1fr 1fr: below ~310px of usable width —
            a small phone, or any phone with the in-app text size turned up,
            which shrinks the layout viewport — two columns cannot hold their
            content and the right-hand cards used to run off the screen. This
            folds to a single column instead, with no media query, so it also
            reacts to `zoom` the way a media query would not. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10 }}>
          <StatCard onClick={() => go('workouts')} label="Workouts">
            <div style={bigNum}>{d.homeWorkoutCount}</div>
            <div style={subLabel}>
              <span>{d.homeWorkoutCount === 1 ? 'session' : 'sessions'}</span>
              <Delta pct={d.deltas.workouts} />
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeWorkoutBuckets} color="indigo" height={34} grid={false} interactive={false} format={(v) => minutes(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('sleep')} label="Sleep">
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
              <BarChart buckets={d.weekBuckets} values={d.homeSleepBuckets} color="indigo" height={34} grid={false} interactive={false} max={10} format={(v) => hm(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('habits')} label="Habits">
            <div style={bigNum}>
              {h.habitPct}
              <span style={unit}>%</span>
            </div>
            <div style={subLabel}>
              <span>{h.weekDone} of {h.weekTotal} so far</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={h.weekDaily} color="indigo" height={34} grid={false} interactive={false} max={100} format={(v) => `${v}%`} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('finances')} label="Spent">
            <div style={{ ...bigNum, fontSize: d.homeWeekSpend >= 100000 ? 22 : 26 }}>{money0(d.homeWeekSpend)}</div>
            <div style={subLabel}>
              <span>this week</span>
              <Delta pct={d.deltas.spend} lowerIsBetter />
            </div>
            <div style={{ marginTop: 10 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeSpendBuckets} color="indigo" height={34} grid={false} interactive={false} format={(v) => moneyShort(v)} />
            </div>
            {d.safe && d.safe.left > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>{money0(d.safe.perDay)} a day safe to spend</div>
            )}
          </StatCard>
        </div>
      </>
    ),

    milestones: (
      <>
        <SectionLabel>Counting since</SectionLabel>
        <div style={listCard}>
          {state!.milestones.map((m) => {
            const e = elapsed(new Date(`${m.since}T12:00:00`).getTime());
            return (
              <div role="button" tabIndex={0}
                key={m.id}
                onClick={() => open('milestone', m)}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
              >
                <span style={iconCell}>
                  <CIcon icon={m.icon} color="var(--text2)" size={19} />
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
          <div role="button" tabIndex={0}
            onClick={() => open('milestone')}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer' }}
          >
            <span style={iconCell}>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--indigo)' }}>
                {state!.milestones.length ? 'Add a date' : 'Count from a date'}
              </div>
              {!state!.milestones.length && (
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>A quit date, an anniversary, a birthday</div>
              )}
            </div>
          </div>
        </div>
      </>
    ),
    counters: (
      <>
        <SectionLabel>{state!.counters.length ? `Counters in ${monthName}` : 'Counters'}</SectionLabel>
        <div role="button" tabIndex={0}
          onClick={() => go('counters')}
          className="press99"
          style={{ ...listCard, cursor: 'pointer' }}
        >
          {state!.counters.length ? (
            state!.counters.slice(0, 4).map((c) => {
              const t = counterTotals(state!.countLogs, c.id);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--hairline)' }}>
                  <span style={iconCell}>
                    <CIcon icon={c.icon} color="var(--text2)" size={18} />
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
              <span style={iconCell}>
                <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--indigo)' }}>Start a counter</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Water, pages, pull-ups: anything you count</div>
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
          Achievements moved to the profile: a trophy with a red dot in the
          header asked for attention every time the app opened. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div tabIndex={0} onClick={() => go('search')} className="press96" role="button" aria-label="Search" style={headBtn}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l3 3" />
          </svg>
        </div>
        <Avatar name={profile.name} src={profile.avatar} size={38} onClick={() => go('settings')} />
      </div>
      <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--text)', marginBottom: 22 }}>
        {greeting()}
        {firstName ? `, ${firstName}` : ''}
      </div>

      {fresh && (
        <div style={{ ...listCard, padding: '16px 16px 14px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{ fontSize: 24, lineHeight: 1.1, color: 'var(--text)' }}>{fresh.title}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text2)', marginTop: 6, lineHeight: 1.45 }}>{fresh.body}</div>
            </div>
            <div tabIndex={0} onClick={dismissFresh} role="button" aria-label="Dismiss" className="press92" style={{ width: 30, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, color: 'var(--text3)', cursor: 'pointer', marginTop: -4, marginRight: -6 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }}>
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </div>
          </div>
          <div tabIndex={0} onClick={fresh.run} role="button" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}>
            {fresh.cta}
          </div>
        </div>
      )}

      {weekDue && (
        <div tabIndex={0} onClick={() => go('weekreview')} className="press99" role="button" style={{ ...listCard, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 16px', marginBottom: 22, cursor: 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>Your week in review</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>A minute to look back, and one thing to aim for next week.</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M7 4l5 5-5 5" />
          </svg>
        </div>
      )}

      {intention && !weekDue && (
        <div style={{ ...listCard, padding: '12px 16px', marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>This week</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{intention}</div>
        </div>
      )}

      {nudge && (
        <div style={{ ...listCard, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 16px', marginBottom: 22 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>
              {nudge.missed === 1 ? `Don’t miss ${nudge.name} twice` : `Back to ${nudge.name}?`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
              {nudge.missed === 1
                ? nudge.why
                  ? `You said: “${nudge.why}”`
                  : 'You missed it last time. Today keeps it going.'
                : `Last done ${nudge.last ? relLabel(new Date(nudge.last + 'T12:00:00').getTime()).replace('Yesterday', 'yesterday') : 'a while ago'}. Start small today: two minutes counts.`}
            </div>
          </div>
          <div tabIndex={0}
            onClick={() => toggleHabit(nudge.id)}
            className="press92"
            role="button"
            aria-label={`Check off ${nudge.name}`}
            style={{ flex: 'none', padding: '9px 15px', borderRadius: 999, background: 'var(--indigo)', color: 'var(--surface)', fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}
          >
            Done
          </div>
        </div>
      )}

      {showChecklist && (
        <div style={{ ...listCard, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)', flex: 1 }}>Getting started</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--indigo)' }}>{stepsDone} of {steps.length}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--hairline)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ width: `${(stepsDone / steps.length) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--indigo)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {steps.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{ width: 19, height: 19, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? 'var(--indigo)' : 'transparent', border: `1.5px solid ${s.done ? 'var(--indigo)' : 'var(--border)'}` }}
                >
                  {s.done && (
                    <svg width="11" height="11" style={{ fill: 'none', stroke: 'var(--surface)', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
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
    </div>
  );
}

function StatCard({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
}
