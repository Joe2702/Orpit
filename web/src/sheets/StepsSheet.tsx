import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { ago, dayKey } from '../lib/format';
import { connectHealth, healthGranted, healthPrefs, healthSupported } from '../lib/health';
import {
  GOAL_PRESETS,
  STEP_GOAL,
  backgroundStatus,
  configureStepAlerts,
  lastDays,
  milestoneOf,
  requestBackground,
  setStepPrefs,
  stepPrefs,
  stepsHabit,
  stepsOn,
  syncSteps,
} from '../lib/steps';
import { toggleKnob, toggleTrack } from '../ui';
import { StepsIcon } from '../StepsHabitRow';
import { date, num, t, tn } from '../i18n';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(20px * var(--sq))',
  boxShadow: 'var(--shadow)',
  padding: 16,
  marginBottom: 12,
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text2)' };
const btn = (primary: boolean): React.CSSProperties => ({
  height: 52,
  borderRadius: 'calc(16px * var(--sq))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  background: primary ? 'var(--indigo)' : 'var(--surface)',
  color: primary ? 'var(--on-accent)' : 'var(--text)',
  border: primary ? 'none' : '1px solid var(--border)',
});

/**
 * Today's steps against the goal: a ring with the quarter marks the
 * notifications use, the last seven days, the goal, and where the steps come
 * from. Opened from the Steps habit and from a step notification.
 */
export function StepsSheet() {
  const { state, applyState, mutateOpt, showToast, haptic, confirm, closeSheet, open } = useStore();
  const s = state!;
  const habit = stepsHabit(s);
  const goal = habit?.goal || STEP_GOAL;
  const today = dayKey();
  const count = stepsOn(s, today)?.count ?? 0;
  const source = stepsOn(s, today)?.source ?? null;
  const pct = Math.min(1, count / goal);
  const reached = count >= goal;
  const done = !!habit && s.checkins.some((c) => c.habitId === habit.id && c.day === today);
  const week = lastDays(s, 7);

  const native = healthSupported();
  const [connected] = useState(() => healthPrefs().on);
  const [stepsAllowed, setStepsAllowed] = useState<boolean | null>(null);
  const [bg, setBg] = useState<{ available: boolean; granted: boolean } | null>(null);
  const [notify, setNotify] = useState(() => stepPrefs().notify);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(() => stepPrefs().lastSync);

  // The latest count when the sheet opens, and what the phone allows.
  useEffect(() => {
    if (!native || !connected) return;
    healthGranted().then((g) => setStepsAllowed(g.steps));
    backgroundStatus().then(setBg);
    setStepPrefs({ lastSync: null });
    syncSteps()
      .then((r) => {
        if (r) applyState(r.state);
        setLastSync(stepPrefs().lastSync);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allowSteps = async () => {
    haptic();
    setBusy(true);
    try {
      const g = await connectHealth();
      setStepsAllowed(g.steps);
      if (!g.steps) return showToast(t('Allow Steps to count them here'));
      const r = await syncSteps();
      if (r) applyState(r.state);
      setLastSync(stepPrefs().lastSync);
    } catch {
      showToast(t('Couldn’t open Health Connect'));
    } finally {
      setBusy(false);
    }
  };

  const setGoal = (g: number) => {
    if (!habit || g === goal) return;
    haptic(8);
    const body = { name: habit.name, color: habit.color, target: habit.target, days: habit.days, why: habit.why, cue: habit.cue ?? null, reminderTime: habit.reminderTime, paused: habit.paused, archived: habit.archived, goal: g };
    mutateOpt((st) => ({ ...st, habits: st.habits.map((x) => (x.id === habit.id ? { ...x, goal: g } : x)) }), () => api.editHabit(habit.id, body), t('Goal set to {n} steps', { n: num(g) })).catch(() => {});
  };

  const toggleToday = () => {
    if (!habit) return;
    haptic(12);
    mutateOpt((st) => {
      const has = st.checkins.some((c) => c.habitId === habit.id && c.day === today);
      return { ...st, checkins: has ? st.checkins.filter((c) => !(c.habitId === habit.id && c.day === today)) : [...st.checkins, { habitId: habit.id, day: today }] };
    }, () => api.toggleHabit(habit.id, today)).catch(() => {});
  };

  const setNotifyOn = (on: boolean) => {
    haptic(8);
    setNotify(on);
    setStepPrefs({ notify: on });
    configureStepAlerts(s);
  };

  const allowBackground = async () => {
    haptic();
    const ok = await requestBackground();
    setBg(await backgroundStatus());
    if (!ok) showToast(t('Notifications will come while Orpit is open'));
  };

  const remove = async () => {
    if (!habit) return;
    const ok = await confirm({
      title: t('Remove the Steps habit?'),
      message: t('Its check-ins go with it. Your step counts stay, and you can add it back here any time.'),
      confirmLabel: t('Remove'),
      danger: true,
    });
    if (!ok) return;
    closeSheet();
    mutateOpt((st) => ({ ...st, habits: st.habits.filter((x) => x.id !== habit.id) }), () => api.deleteHabit(habit.id), t('Steps habit removed')).catch(() => {});
  };

  const addBack = () => {
    haptic();
    setBusy(true);
    api
      .addHabit({ name: 'Steps', color: 'emerald', target: 'Daily', days: '1111111', auto: 'steps', goal: STEP_GOAL })
      .then((st) => {
        applyState(st);
        showToast(t('Steps is back in your habits'));
      })
      .catch(() => showToast(t('That didn’t work. Try again in a moment.')))
      .finally(() => setBusy(false));
  };

  // ---- The ring ----
  const SIZE = 208;
  const W = 14;
  const R = (SIZE - W) / 2;
  const C = 2 * Math.PI * R;
  const at = (p: number) => {
    const a = -Math.PI / 2 + 2 * Math.PI * p;
    return { x: SIZE / 2 + R * Math.cos(a), y: SIZE / 2 + R * Math.sin(a) };
  };
  const m = milestoneOf(count, goal);
  const left = Math.max(0, goal - count);
  const nextMark = [0.25, 0.5, 0.75, 1].find((p) => count < goal * p);

  // ---- The week ----
  const H = 96;
  const top = Math.max(goal, ...week.map((d) => d.count)) * 1.1;
  const counted = week.filter((d) => d.count > 0);
  const avg = counted.length ? Math.round(counted.reduce((a, d) => a + d.count, 0) / counted.length) : 0;
  const atGoal = week.filter((d) => d.count >= goal).length;
  const hasData = (s.steps || []).length > 0;

  return (
    <div style={{ padding: '8px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '8px 2px 16px' }}>
        <div className="display" style={{ fontSize: 28, lineHeight: 1.1, color: 'var(--text)' }}>{t('Steps')}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{date(Date.now(), { weekday: 'long', day: 'numeric', month: 'short' })}</div>
      </div>

      {/* Not counting yet on this phone: say how to start. */}
      {native && !connected && (
        <div style={{ ...card, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', background: 'color-mix(in srgb, var(--indigo) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StepsIcon size={28} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{t('Count your steps automatically')}</div>
          <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.55, margin: '8px 0 16px' }}>
            {t('Connect Samsung Health, Google Fit, Fitbit or another health app, and this habit ticks itself the day you reach your goal.')}
          </div>
          <div role="button" tabIndex={0} onClick={() => open('health')} className="press99" style={btn(true)}>
            {t('Connect your health app')}
          </div>
        </div>
      )}
      {native && connected && stepsAllowed === false && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Steps aren’t allowed yet')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{t('Health Connect needs your OK to share them with Orpit.')}</div>
          </div>
          <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : allowSteps} className="press" style={{ ...btn(true), height: 44, padding: '0 16px', flex: 'none' }}>
            {t('Allow')}
          </div>
        </div>
      )}
      {!native && !hasData && (
        <div style={{ ...card, fontSize: 15, color: 'var(--text2)', lineHeight: 1.55 }}>
          {t('Steps are counted by the Orpit app on Android, from your health app. Until then you can tick this habit yourself.')}
        </div>
      )}

      {/* Today */}
      {(connected || hasData) && (
        <div style={{ ...card, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} style={{ fill: 'none', stroke: 'var(--hairline)', strokeWidth: W }} />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: W, strokeLinecap: 'round', strokeDasharray: `${C * pct} ${C}`, transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }}
              />
              {/* The quarter marks the notifications fire at. */}
              {[0.25, 0.5, 0.75].map((p) => {
                const { x, y } = at(p);
                const passed = pct >= p;
                return <circle key={p} cx={x} cy={y} r={4} style={{ fill: passed ? 'var(--on-accent)' : 'var(--surface)', stroke: passed ? 'none' : 'var(--text3)', strokeWidth: 1.5 }} />;
              })}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em', lineHeight: 1 }}>{num(count)}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>{t('of {goal} steps', { goal: num(goal) })}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: reached ? 'var(--success)' : 'var(--indigo)', marginTop: 4 }}>{t('{n}%', { n: Math.round((count / goal) * 100) })}</div>
            </div>
          </div>
          <div role="status" style={{ fontSize: 15, fontWeight: 600, color: reached ? 'var(--success)' : 'var(--text)', marginTop: 16, textAlign: 'center' }}>
            {reached ? t('Goal reached 🎉') : count === 0 ? t('No steps counted yet today') : tn(left, '{n} step to go', '{n} steps to go')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, textAlign: 'center' }}>
            {reached
              ? habit
                ? done
                  ? t('Your Steps habit is done for today.')
                  : t('Ticked off when Orpit next syncs.')
                : t('A good day on your feet.')
              : nextMark && nextMark < 1 && m < 75
                ? t('Next mark: {pct}% at {n}', { pct: Math.round(nextMark * 100), n: num(Math.round(goal * nextMark)) })
                : t('Almost there.')}
          </div>
        </div>
      )}

      {/* The last seven days against the goal */}
      {(connected || hasData) && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={label}>{t('Last 7 days')}</span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{tn(atGoal, '{n} day at goal', '{n} days at goal')}</span>
          </div>
          <div style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: (goal / top) * H, borderTop: '1.5px dashed color-mix(in srgb, var(--indigo) 55%, transparent)' }} />
            {week.map((d) => {
              const isToday = d.day === today;
              const met = d.count >= goal;
              return (
                <div key={d.day} style={{ flex: 1, display: 'flex', justifyContent: 'center', height: '100%', alignItems: 'flex-end' }} title={num(d.count)}>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 28,
                      height: Math.max(d.count ? 4 : 2, (d.count / top) * H),
                      borderRadius: 'calc(8px * var(--sq)) calc(8px * var(--sq)) 4px 4px',
                      background: met ? 'var(--indigo)' : d.count ? 'color-mix(in srgb, var(--indigo) 35%, transparent)' : 'var(--hairline)',
                      outline: isToday ? '1.5px solid var(--indigo)' : 'none',
                      outlineOffset: 2,
                      transition: 'height .5s cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {week.map((d) => (
              <div key={d.day} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: d.day === today ? 700 : 500, color: d.day === today ? 'var(--text)' : 'var(--text3)' }}>
                {date(d.ts, { weekday: 'narrow' })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{avg ? num(avg) : '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('a day on average')}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{counted.length ? num(Math.max(...week.map((d) => d.count))) : '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('best day')}</div>
            </div>
          </div>
        </div>
      )}

      {/* The goal */}
      {habit && (
        <div style={card}>
          <div style={{ ...label, marginBottom: 12 }}>{t('Daily goal')}</div>
          <div role="radiogroup" aria-label={t('Daily goal')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[...new Set([...GOAL_PRESETS, goal])].sort((a, b) => a - b).map((g) => {
              const on = g === goal;
              return (
                <div
                  key={g}
                  role="radio"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => setGoal(g)}
                  className="press"
                  style={{
                    padding: '8px 12px',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 'calc(12px * var(--sq))',
                    fontSize: 15,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'pointer',
                    border: `1.5px solid ${on ? 'var(--indigo)' : 'var(--border)'}`,
                    background: on ? 'color-mix(in srgb, var(--indigo) 12%, transparent)' : 'var(--surface)',
                    color: on ? 'var(--indigo)' : 'var(--text2)',
                  }}
                >
                  {num(g)}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>{t('Reaching it ticks your Steps habit for the day.')}</div>
        </div>
      )}

      {/* The notifications */}
      {native && connected && habit && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Progress notifications')}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{t('At 25%, 50% and 75% of your goal, and when you reach it.')}</div>
            </div>
            <div role="switch" aria-checked={notify} aria-label={t('Progress notifications')} tabIndex={0} onClick={() => setNotifyOn(!notify)} style={toggleTrack(notify)}>
              <div style={toggleKnob(notify)} />
            </div>
          </div>
          {notify && bg && !bg.granted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                {bg.available ? t('Allow Orpit to read steps in the background, so they come while it’s closed.') : t('This phone only lets Orpit check while it’s open.')}
              </div>
              {bg.available && (
                <div role="button" tabIndex={0} onClick={allowBackground} className="press" style={{ ...btn(false), height: 44, padding: '0 16px', flex: 'none' }}>
                  {t('Allow')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Where they come from */}
      {native && connected && (
        <div role="button" tabIndex={0} onClick={() => open('health')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 4px', cursor: 'pointer' }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>
            {[source ? t('From {app}', { app: source }) : t('From Health Connect'), lastSync ? t('updated {when}', { when: ago(lastSync) }) : null].filter(Boolean).join(' · ')}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)' }}>{t('Health app')}</span>
        </div>
      )}

      {/* By hand, and the habit itself */}
      {habit ? (
        <>
          <div role="button" tabIndex={0} onClick={toggleToday} className="press99" style={{ ...btn(false), marginTop: 8 }}>
            {done ? t('Undo today’s check-in') : t('Mark today done')}
          </div>
          <div role="button" tabIndex={0} onClick={remove} style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--danger)', marginTop: 16, padding: 8, cursor: 'pointer' }}>
            {t('Remove the Steps habit')}
          </div>
        </>
      ) : (
        <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : addBack} className="press99" style={{ ...btn(true), marginTop: 8 }}>
          {t('Add Steps to your habits')}
        </div>
      )}
    </div>
  );
}
