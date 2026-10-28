import React, { useMemo, useState } from 'react';
import { track } from '../lib/usage';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BackButton, Card, chip } from '../ui';
import { money0 } from '../lib/format';
import { summariseWeek, finishReview } from '../lib/weekReview';

const fmt = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * A minute at the end of the week: what happened, anything to settle, and one
 * thing to aim for next. It ends on what went well, when something did,
 * because the end of an experience is what people remember of it.
 */
export function WeekReview() {
  const { state, go, showToast, haptic } = useStore();
  const { d } = useData();
  const w = useMemo(() => summariseWeek(state!), [state]);
  const [pick, setPick] = useState<string | null>(null);
  const [own, setOwn] = useState('');

  const diff = w.spent - w.spentBefore;
  const over = d.budgets.filter((b) => b.pct >= 100).map((b) => b.cat);
  const habitPct = w.habitPlanned ? Math.round((w.habitDone / w.habitPlanned) * 100) : null;
  const ideas = [
    w.topCat ? `Spend less on ${w.topCat}` : null,
    w.weakestHabit ? `${w.weakestHabit} on every planned day` : null,
    'Train three times',
    'In bed by midnight',
  ].filter((x): x is string => !!x);

  // Only true things, and only good ones: a closing line that scolds is the
  // part of the week people would remember.
  const good =
    habitPct != null && habitPct >= 70
      ? `You kept ${habitPct}% of your habit plan.`
      : w.spentBefore > 0 && diff < 0
        ? `You spent ${money0(-diff)} less than the week before.`
        : w.workouts >= 3
          ? `${w.workouts} workouts this week.`
          : null;

  const done = () => {
    haptic();
    finishReview(own.trim() || pick);
    track('week_review');
    showToast(own.trim() || pick ? 'Set for next week' : 'See you next week');
    go('home');
  };

  const section = (title: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>{title}</div>;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <BackButton onClick={() => go('home')} />
        <div className="display" style={{ flex: 1, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>Your week</div>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 2px 20px' }}>
        {fmt(w.from)} – {fmt(w.to)}
      </div>

      {section('Money')}
      <Card style={{ padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)' }}>{money0(w.spent)} spent</div>
        {w.spentBefore > 0 && diff !== 0 && (
          <div style={{ fontSize: 13.5, color: 'var(--text2)', marginTop: 2 }}>
            {money0(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than the week before
          </div>
        )}
        {w.topPlaces.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {w.topPlaces.map((p) => (
              <div key={p.name} style={{ display: 'flex', fontSize: 14 }}>
                <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{money0(p.total)}</span>
              </div>
            ))}
          </div>
        )}
        {over.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>Over budget this month: {over.join(', ')}</div>
        )}
      </Card>

      {d.reviewCount > 0 && (
        <div tabIndex={0} onClick={() => go('freview')} className="press99" role="button" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 14px', marginBottom: 18, cursor: 'pointer' }}>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>
            {d.reviewCount === 1 ? 'One payment to check' : `${d.reviewCount} payments to check`}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)' }}>Check</span>
        </div>
      )}

      {section('You')}
      <Card style={{ padding: '16px 18px', marginBottom: 18 }}>
        {habitPct != null && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)', flex: 1 }}>Habits</span>
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>
                {w.habitDone} of {w.habitPlanned} planned
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface2)', marginTop: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${habitPct}%`, background: 'var(--indigo)', borderRadius: 999 }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 18, marginTop: habitPct != null ? 14 : 0, fontSize: 14, color: 'var(--text2)' }}>
          <span>
            <b style={{ color: 'var(--text)', fontWeight: 650 }}>{w.workouts}</b> {w.workouts === 1 ? 'workout' : 'workouts'}
          </span>
          {w.avgSleep != null && (
            <span>
              <b style={{ color: 'var(--text)', fontWeight: 650 }}>{w.avgSleep} h</b> sleep a night
            </span>
          )}
        </div>
      </Card>

      {section('One thing for next week')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {ideas.map((i) => (
          <div role="button" tabIndex={0} aria-pressed={pick === i && !own}
            key={i}
            onClick={() => {
              setPick(pick === i ? null : i);
              setOwn('');
            }}
            className="press99"
            style={chip(pick === i && !own, 'var(--indigo)')}
          >
            {i}
          </div>
        ))}
      </div>
      <input
        value={own}
        onChange={(e) => setOwn(e.target.value)}
        placeholder="Or write your own"
        maxLength={120}
        style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }}
      />

      {good && <div style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', marginBottom: 14 }}>{good}</div>}
      <div tabIndex={0} onClick={done} className="press" role="button" style={{ background: 'var(--indigo)', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
        Done
      </div>
    </div>
  );
}
