import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { greeting, minutes, hm, money0, moneyShort, cNum, counterTotals, dayKey, relLabel, listSep } from '../lib/format';
import { missedRun } from '../lib/comeback';
import { dayCompleteLine } from '../lib/dayComplete';
import { reviewDue, currentIntention } from '../lib/weekReview';
import { briefDue, hasBriefData } from '../lib/brief';
import { assistantUnread } from '../lib/assistant';
import { dueNow, listCounts } from '../lib/todos';
import { TodoRow } from '../TodoRow';
import { useReminderSlide } from '../ReminderOnboarding';
import { ForYou, SlideButton, SlideDismiss, SlideIcon, type Slide } from '../ForYou';
import { period } from '../lib/period';
import { freshStart } from '../lib/freshStart';
import { parseLayout, reconcile } from '../lib/layout';
import { Reorderable } from '../Reorderable';
import { BarChart } from '../lib/charts';
import { Avatar, SectionLabel } from '../ui';
import { enabled } from '../lib/modules';
import { CIcon } from '../lib/iconPaths';
import { elapsed, formatElapsed } from '../lib/since';
import { date, getLang, t, tData, tn } from '../i18n';


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
  fontSize: 13,
  color: 'var(--text2)',
  marginTop: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  columnGap: 8,
  minWidth: 0,
};

function Delta({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      style={{ fontSize: 11, fontWeight: 700, color: good ? 'var(--text2)' : 'var(--danger)', whiteSpace: 'nowrap' }}
      aria-label={up ? t('Up {n} percent vs last week', { n: Math.abs(pct) }) : t('Down {n} percent vs last week', { n: Math.abs(pct) })}
    >
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

const bigNum: React.CSSProperties = { fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', color: 'var(--text)', lineHeight: 1.05, whiteSpace: 'nowrap' };
const unit: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text2)', marginInlineStart: 1 };
const listCard: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' };
const iconCell: React.CSSProperties = { width: 24, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const headBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', flex: 'none' };

const FRESH_KEY = 'orbit_fresh_dismissed';
/** Directions of the little sparks thrown off when the day's list is finished. */
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

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
  const monthName = date(Date.now(), { month: 'long' });
  // Only show habits scheduled for today's weekday (Sun=0 … Sat=6).
  const dow = new Date().getDay();
  const todaysHabits = h.habits.filter((hb) => !hb.paused && (hb.days || '1111111')[dow] === '1');
  const doneCount = todaysHabits.filter((x) => x.done).length;
  const allDone = todaysHabits.length > 0 && doneCount === todaysHabits.length;
  // What to say when the list is done: something true about the person,
  // from their own record (see lib/dayComplete).
  const dayLine = React.useMemo(() => dayCompleteLine(state!), [state]);
  const [burst, setBurst] = React.useState(false);
  const burstTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(burstTimer.current), []);

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
    if (finishing) {
      setBurst(true);
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(false), 1600);
    }
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
  // The morning brief, offered until it's read or the morning is over.
  // Claude's brief is offered whenever a new one has come in, morning or not.
  const claudeNew = assistantUnread(state!.assistantBrief) ? state!.assistantBrief! : null;
  const briefOpen = !!claudeNew || (briefDue() && hasBriefData(state!));
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
    { label: t('Create your account'), done: true },
    { label: t('Check off a habit'), done: state!.checkins.length > 0 },
    { label: t('Log a workout or a night of sleep'), done: state!.workouts.length > 0 || state!.nights.length > 0 },
    { label: t('Add your first transaction'), done: state!.txns.length > 0 },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const showChecklist = stepsDone < steps.length;

  // ---- Movable dashboard blocks ----
  // ---- To-do: what's due today, and every list one tap away ----
  const due = dueNow(state!).slice(0, 5);
  const lists = state!.todoLists;
  const openTotal = state!.todos.filter((x) => x.doneTs == null).length;

  const blocks: Record<string, React.ReactNode> = {
    todos: (
      <>
        <SectionLabel action={lists.length ? { label: t('All lists'), onClick: () => go('todos') } : undefined}>{t('To-do')}</SectionLabel>
        <div style={listCard}>
          {due.map((x) => {
            const l = lists.find((y) => y.id === x.listId)!;
            return <TodoRow key={x.id} x={x} color={l.color} list={{ name: l.name, color: l.color }} onOpen={() => open('todo', { id: x.id })} />;
          })}
          {lists.length > 0 && due.length === 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Nothing due today')}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{tn(openTotal, 'One thing to do across your lists', '{n} things to do across your lists')}</div>
            </div>
          )}
          {lists.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
              {lists.map((l) => (
                <div key={l.id} role="button" tabIndex={0} onClick={() => go('todolist', { id: l.id })} className="press96 hit" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg)', flex: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${l.color})` }} />
                  {l.name}
                  <span style={{ color: 'var(--text2)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{listCounts(state!, l.id).open}</span>
                </div>
              ))}
            </div>
          )}
          <div role="button" tabIndex={0} onClick={() => (lists.length ? open('todo') : go('todos'))} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px', cursor: 'pointer' }}>
            <span style={iconCell}>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>{lists.length ? t('Add a task') : t('Make your first list')}</div>
              {!lists.length && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{t('Uni, work, training: a list for each')}</div>}
            </div>
          </div>
        </div>
      </>
    ),
    habits: (
      <>
        <SectionLabel action={todaysHabits.length ? { label: t('{doneCount} of {n}', { doneCount, n: todaysHabits.length }), onClick: () => go('habits') } : undefined}>{t('Today')}</SectionLabel>
        {todaysHabits.length === 0 ? (
          <div style={{ ...listCard, padding: '16px 16px', fontSize: 15, color: 'var(--text2)', textAlign: 'center' }}>{t('Nothing scheduled today')}</div>
        ) : (
          <div style={listCard}>
            {/* Progress across the day's list. Effort rises as a goal gets
                close (the goal-gradient effect), so the bar is the nudge. */}
            <div style={{ height: 3, background: 'var(--hairline)' }}>
              <div style={{ height: '100%', width: `${(doneCount / todaysHabits.length) * 100}%`, background: 'var(--indigo)', transition: 'width .45s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            {allDone && (
              // The high point of the day in the app. Finishing the list right
              // here gets the burst; opening the app on a finished day just
              // shows the row, so it never turns into a fanfare on every launch.
              <div className="daydone" data-burst={burst ? '' : undefined} role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
                <span className="daydone-badge" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                  </svg>
                  {SPARKS.map((a) => (
                    <i key={a} className="daydone-spark" style={{ ['--a' as string]: `${a}deg` }} />
                  ))}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Today’s list is done.')}</div>
                  <div className="daydone-line" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{dayLine.text}</div>
                </div>
              </div>
            )}
            {todaysHabits.map((hb) => (
              <div tabIndex={0} key={hb.id} onClick={() => toggleHabit(hb.id)} role="checkbox" aria-checked={hb.done} aria-label={tData(hb.name)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}>
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
                  <div style={{ fontSize: 15, fontWeight: 500, color: hb.done ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color .2s' }}>{tData(hb.name)}</div>
                  {/* The plan the user wrote ("after my morning coffee") is the
                      most useful thing to read at the moment of doing it. */}
                  {(hb.cue || hb.reminderTime) && !hb.done && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hb.cue || t('Reminder at {reminderTime}', { reminderTime: hb.reminderTime ?? '' })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{hb.total}</div>
              </div>
            ))}
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text2)' }}>
              {h.weekPlanned === 0
                ? t('Nothing else planned this week.')
                : h.weekSecured
                ? t('This week already counts. Anything more is extra.')
                : tn(h.weekToGo, '{n} more check-in and this week counts.', '{n} more check-ins and this week counts.')}
            </div>
          </div>
        )}
      </>
    ),

    week: (
      <>
        <SectionLabel action={{ label: weekCaption, onClick: () => go('analytics') }}>{t('This week')}</SectionLabel>
        {/* auto-fit rather than a hard 1fr 1fr: below ~310px of usable width —
            a small phone, or any phone with the in-app text size turned up,
            which shrinks the layout viewport — two columns cannot hold their
            content and the right-hand cards used to run off the screen. This
            folds to a single column instead, with no media query, so it also
            reacts to `zoom` the way a media query would not. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 8 }}>
          <StatCard onClick={() => go('workouts')} label={t('Workouts')}>
            <div style={bigNum}>{d.homeWorkoutCount}</div>
            <div style={subLabel}>
              <span>{tn(d.homeWorkoutCount, 'session', 'sessions')}</span>
              <Delta pct={d.deltas.workouts} />
            </div>
            <div style={{ marginTop: 8 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeWorkoutBuckets} color="indigo" height={34} grid={false} interactive={false} format={(v) => minutes(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('sleep')} label={t('Sleep')}>
            <div style={bigNum}>
              {d.homeSleepData.length ? (
                <>
                  {Math.floor(d.homeSlAvg)}
                  <span style={unit}>{t('h')}</span> {String(Math.round((d.homeSlAvg % 1) * 60)).padStart(2, '0')}
                  <span style={unit}>{t('m')}</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div style={subLabel}>
              <span>{t('a night')}</span>
              <Delta pct={d.deltas.sleep} />
            </div>
            <div style={{ marginTop: 8 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeSleepBuckets} color="indigo" height={34} grid={false} interactive={false} max={10} format={(v) => hm(v)} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('habits')} label={t('Habits')}>
            <div style={bigNum}>
              {h.habitPct}
              <span style={unit}>%</span>
            </div>
            <div style={subLabel}>
              <span>{t('{weekDone} of {weekTotal} so far', { weekDone: h.weekDone, weekTotal: h.weekTotal })}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <BarChart buckets={d.weekBuckets} values={h.weekDaily} color="indigo" height={34} grid={false} interactive={false} max={100} format={(v) => `${v}%`} />
            </div>
          </StatCard>

          <StatCard onClick={() => go('finances')} label={t('Spent')}>
            <div style={{ ...bigNum, fontSize: d.homeWeekSpend >= 100000 ? 22 : 28 }}>{money0(d.homeWeekSpend)}</div>
            <div style={subLabel}>
              <span>{t('this week')}</span>
              <Delta pct={d.deltas.spend} lowerIsBetter />
            </div>
            <div style={{ marginTop: 8 }}>
              <BarChart buckets={d.weekBuckets} values={d.homeSpendBuckets} color="indigo" height={34} grid={false} interactive={false} format={(v) => moneyShort(v)} />
            </div>
            {d.safe && d.safe.left > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>{t('{amount} a day safe to spend', { amount: money0(d.safe.perDay) })}</div>
            )}
          </StatCard>
        </div>
      </>
    ),

    milestones: (
      <>
        <SectionLabel>{t('Counting since')}</SectionLabel>
        <div style={listCard}>
          {state!.milestones.map((m) => {
            const e = elapsed(new Date(`${m.since}T12:00:00`).getTime());
            return (
              <div role="button" tabIndex={0}
                key={m.id}
                onClick={() => open('milestone', m)}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
              >
                <span style={iconCell}>
                  <CIcon icon={m.icon} color="var(--text2)" size={19} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{formatElapsed(e)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}>
                  {tn(e.totalDays, '{n} day', '{n} days')}
                </div>
              </div>
            );
          })}
          <div role="button" tabIndex={0}
            onClick={() => open('milestone')}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px', cursor: 'pointer' }}
          >
            <span style={iconCell}>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>
                {state!.milestones.length ? t('Add a date') : t('Count from a date')}
              </div>
              {!state!.milestones.length && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{t('A quit date, an anniversary, a birthday')}</div>
              )}
            </div>
          </div>
        </div>
      </>
    ),
    counters: (
      <>
        <SectionLabel>{state!.counters.length ? t('Counters in {monthName}', { monthName }) : t('Counters')}</SectionLabel>
        <div role="button" tabIndex={0}
          onClick={() => go('counters')}
          className="press99"
          style={{ ...listCard, cursor: 'pointer' }}
        >
          {state!.counters.length ? (
            state!.counters.slice(0, 4).map((c) => {
              const t = counterTotals(state!.countLogs, c.id);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px' }}>
              <span style={iconCell}>
                <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>{t('Start a counter')}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{t('Water, pages, pull-ups: anything you count')}</div>
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
    ...(enabled(state!, 'todos') ? ['todos'] : []),
    'week',
    ...(enabled(state!, 'counters') ? ['counters'] : []),
    // Always offered: a milestone belongs to no tracker, and the empty state is
    // the invitation to make the first one.
    'milestones',
  ];
  const order = reconcile(parseLayout(profile.layout).home, blockList);
  const items = order.map((id) => ({ id, node: <div style={{ marginBottom: 24 }}>{blocks[id]}</div> }));
  const saveOrder = (ids: string[]) => {
    const next = { ...parseLayout(profile.layout), home: ids };
    mutate(() => api.updateMe({ layout: JSON.stringify(next) }));
  };

  // ---- For you: the day's prompts, one card you swipe through ----
  // Ordered by what can't wait: the brief belongs to the morning, a habit at
  // risk has to be done today, the rest keeps for the week.
  const reminder = useReminderSlide();
  const slides: Slide[] = [];
  if (briefOpen)
    slides.push({
      key: 'brief',
      icon: SlideIcon.brief,
      title: claudeNew ? t('Claude’s brief is in') : t('Your morning brief'),
      text: claudeNew ? claudeNew.sections.map((s) => s.heading).join(listSep()) : t('Last night, today’s plan and your money, in a minute.'),
      oneLine: !!claudeNew,
      onOpen: () => go('brief'),
    });
  if (nudge)
    slides.push({
      key: 'nudge-' + nudge.id,
      icon: SlideIcon.habit,
      title: tn(nudge.missed, 'Don’t miss {name} twice', 'Back to {name}?', { name: nudge.name }),
      text:
        nudge.missed === 1
          ? nudge.why
            ? t('You said: “{why}”', { why: nudge.why })
            : t('You missed it last time. Today keeps it going.')
          : nudge.last
            ? t('Last done {when}. Start small today: two minutes counts.', { when: relLabel(new Date(nudge.last + 'T12:00:00').getTime()).replace('Yesterday', 'yesterday') })
            : t('Last done a while ago. Start small today: two minutes counts.'),
      end: (
        <SlideButton onClick={() => toggleHabit(nudge.id)} label={t('Check off {name}', { name: nudge.name })}>
          {t('Done')}
        </SlideButton>
      ),
    });
  if (fresh)
    slides.push({
      key: 'fresh',
      icon: SlideIcon.fresh,
      title: fresh.title,
      text: fresh.body,
      label: fresh.cta,
      onOpen: fresh.run,
      end: <SlideDismiss onClick={dismissFresh} />,
    });
  if (weekDue)
    slides.push({
      key: 'review',
      icon: SlideIcon.review,
      title: t('Your week in review'),
      text: t('A minute to look back, and one thing to aim for next week.'),
      onOpen: () => go('weekreview'),
    });
  if (reminder) slides.push(reminder);
  if (intention && !weekDue)
    slides.push({
      key: 'aim',
      icon: SlideIcon.aim,
      title: intention,
      text: t('The one thing you chose in your weekly review.'),
    });

  return (
    <div style={{ padding: '8px 20px 28px', animation: 'fadeIn .4s ease' }}>
      {/* Date and controls on one row, the greeting on its own beneath them.
          Achievements moved to the profile: a trophy with a red dot in the
          header asked for attention every time the app opened. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {date(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {/* The brief is always a tap away, not only while the morning card shows. */}
        <div tabIndex={0} onClick={() => go('brief')} className="press96 hit" role="button" aria-label={t('Morning brief')} style={{ ...headBtn, position: 'relative' }}>
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M3 15.5h16M6 15.5a5 5 0 0 1 10 0M11 4.5v2.2M4.6 8.1l1.5 1.5M17.4 8.1l-1.5 1.5M7 18.5h8" />
          </svg>
          {claudeNew && <span aria-hidden style={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 8, height: 8, borderRadius: 9, background: 'var(--indigo)', boxShadow: '0 0 0 2px var(--surface)' }} />}
        </div>
        <div tabIndex={0} onClick={() => go('search')} className="press96 hit" role="button" aria-label={t('Search')} style={headBtn}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l3 3" />
          </svg>
        </div>
        <Avatar name={profile.name} src={profile.avatar} size={38} onClick={() => go('settings')} />
      </div>
      <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--text)', marginBottom: 24 }}>
        {greeting()}
        {firstName ? `${getLang() === 'ar' ? '،' : ','} ${firstName}` : ''}
      </div>

      <ForYou slides={slides} />

      {showChecklist && (
        <div style={{ ...listCard, padding: '16px 16px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{t('Getting started')}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--indigo)' }}>{t('{stepsDone} of {n}', { stepsDone, n: steps.length })}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--hairline)', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${(stepsDone / steps.length) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--indigo)', transition: 'width .4s' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 19, height: 19, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? 'var(--indigo)' : 'transparent', border: `1.5px solid ${s.done ? 'var(--indigo)' : 'var(--border)'}` }}
                >
                  {s.done && (
                    <svg width="11" height="11" style={{ fill: 'none', stroke: 'var(--surface)', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                      <path d="M2.5 5.8l2.2 2.2L9 3.4" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 13, color: s.done ? 'var(--text2)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Reorderable items={items} onReorder={saveOrder} handleTop={4} />
    </div>
  );
}

function StatCard({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} className="press" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
}
