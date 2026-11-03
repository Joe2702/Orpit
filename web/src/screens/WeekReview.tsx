import React, { useEffect, useMemo, useState } from 'react';
import { track } from '../lib/usage';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BackButton, Card, chip } from '../ui';
import { money0, listSep, hm } from '../lib/format';
import { RisingWords, RollingText, reducedMotion } from '../Motion';
import { summariseWeek, finishReview } from '../lib/weekReview';
import { date, num, t, tData, tn } from '../i18n';

const fmt = (ts: number) => date(ts, { month: 'short', day: 'numeric' });

/**
 * A minute at the end of the week: what happened, anything to settle, and one
 * thing to aim for next. It ends on what went well, when something did,
 * because the end of an experience is what people remember of it.
 */
export function WeekReview() {
  const { state, go, showToast, haptic, back } = useStore();
  const { d } = useData();
  const w = useMemo(() => summariseWeek(state!), [state]);
  const [pick, setPick] = useState<string | null>(null);
  const [own, setOwn] = useState('');

  const diff = w.spent - w.spentBefore;
  const over = d.budgets.filter((b) => b.pct >= 100).map((b) => b.cat);
  const habitPct = w.habitPlanned ? Math.round((w.habitDone / w.habitPlanned) * 100) : null;
  const ideas = [
    w.topCat ? t('Spend less on {cat}', { cat: tData(w.topCat) }) : null,
    w.weakestHabit ? t('{habit} on every planned day', { habit: tData(w.weakestHabit) }) : null,
    t('Train three times'),
    t('In bed by midnight'),
  ].filter((x): x is string => !!x);

  // Only true things, and only good ones: a closing line that scolds is the
  // part of the week people would remember.
  const good =
    habitPct != null && habitPct >= 70
      ? t('You kept {n}% of your habit plan.', { n: habitPct })
      : w.spentBefore > 0 && diff < 0
        ? t('You spent {amount} less than the week before.', { amount: money0(-diff) })
        : w.workouts >= 3
          ? tn(w.workouts, '{n} workout this week.', '{n} workouts this week.')
          : null;

  const done = () => {
    haptic();
    finishReview(own.trim() || pick);
    track('week_review');
    showToast(own.trim() || pick ? t('Set for next week') : t('See you next week'));
    go('home');
  };

  const section = (title: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>{title}</div>;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <BackButton onClick={back} />
        <div className="display" style={{ flex: 1, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Your week')}</div>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 2px 20px' }}>
        {fmt(w.from)} – {fmt(w.to)}
      </div>

      {section(t('Money'))}
      <Card style={{ padding: '16px 18px', marginBottom: 18, animation: 'cardIn .55s cubic-bezier(.2,.8,.2,1) .05s both' }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)' }}>
          <RollingText text={t('{amount} spent', { amount: money0(w.spent) })} delay={0.15} />
        </div>
        {w.spentBefore > 0 && diff !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--text2)', marginTop: 4, animation: 'storyRise .5s ease .6s both' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', transform: diff > 0 ? 'none' : 'rotate(180deg)' }}>
              <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
            </svg>
            {diff > 0 ? t('{amount} more than the week before', { amount: money0(Math.abs(diff)) }) : t('{amount} less than the week before', { amount: money0(Math.abs(diff)) })}
          </div>
        )}
        {w.spent > 0 && <DayBars daily={w.daily} from={w.from} />}
        {w.topPlaces.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {w.topPlaces.map((p, k) => (
              <div key={p.name} style={{ position: 'relative', display: 'flex', fontSize: 14, padding: '6px 10px', borderRadius: 10, overflow: 'hidden' }}>
                {/* Each place's share of the biggest, filling in behind it. */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    insetBlock: 0,
                    insetInlineStart: 0,
                    width: `${(p.total / w.topPlaces[0].total) * 100}%`,
                    background: 'var(--indigo)',
                    opacity: 0.12,
                    borderRadius: 10,
                    transformOrigin: document.dir === 'rtl' ? 'right' : 'left',
                    animation: `storyBar .9s cubic-bezier(.2,.8,.2,1) ${0.5 + k * 0.12}s both`,
                  }}
                />
                <span style={{ position: 'relative', flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ position: 'relative', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{money0(p.total)}</span>
              </div>
            ))}
          </div>
        )}
        {over.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{t('Over budget this month: {cats}', { cats: over.map((c) => tData(c)).join(listSep()) })}</div>
        )}
      </Card>

      {d.reviewCount > 0 && (
        <div tabIndex={0} onClick={() => go('freview')} className="press99" role="button" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 14px', marginBottom: 18, cursor: 'pointer', animation: 'cardIn .55s cubic-bezier(.2,.8,.2,1) .12s both' }}>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>
            {tn(d.reviewCount, 'One payment to check', '{n} payments to check')}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)' }}>{t('Check')}</span>
        </div>
      )}

      {section(t('You'))}
      <Card style={{ padding: '16px 14px', marginBottom: 18, animation: 'cardIn .55s cubic-bezier(.2,.8,.2,1) .18s both' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + (habitPct != null ? 1 : 0) + (w.avgSleep != null ? 1 : 0)}, minmax(0, 1fr))`, gap: 8, textAlign: 'center' }}>
          {habitPct != null && (
            <div>
              <HabitRing pct={habitPct} />
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text)', marginTop: 8 }}>{t('Habits')}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{t('{habitDone} of {habitPlanned} planned', { habitDone: w.habitDone, habitPlanned: w.habitPlanned })}</div>
            </div>
          )}
          <Stat value={num(w.workouts)} label={t('Workouts')} delay={0.35} />
          {w.avgSleep != null && <Stat value={hm(w.avgSleep)} label={t('sleep a night')} delay={0.45} />}
        </div>
      </Card>

      {section(t('One thing for next week'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {ideas.map((i, k) => (
          <div role="button" tabIndex={0} aria-pressed={pick === i && !own}
            key={i}
            onClick={() => {
              setPick(pick === i ? null : i);
              setOwn('');
            }}
            className="press99"
            style={{ ...chip(pick === i && !own, 'var(--indigo)'), animation: `storyRise .45s cubic-bezier(.2,.8,.2,1) ${0.35 + k * 0.06}s both` }}
          >
            {i}
          </div>
        ))}
      </div>
      <input
        value={own}
        onChange={(e) => setOwn(e.target.value)}
        placeholder={t('Or write your own')}
        maxLength={120}
        style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }}
      />

      {good && (
        <div style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', marginBottom: 14 }}>
          <RisingWords text={good} delay={0.6} step={0.05} />
        </div>
      )}
      <div tabIndex={0} onClick={done} className="press" role="button" style={{ background: 'var(--indigo)', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
        {t('Done')}
      </div>
    </div>
  );
}

/** The seven days' spending as bars that grow in, today's in the accent. */
function DayBars({ daily, from }: { daily: number[]; from: number }) {
  const max = Math.max(...daily, 1);
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 86, marginTop: 16 }}>
      {daily.map((v, k) => (
        <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: '100%',
              maxWidth: 30,
              height: `${Math.max(v > 0 ? 8 : 3, (v / max) * 62)}px`,
              borderRadius: 7,
              background: v > 0 ? 'var(--indigo)' : 'var(--surface2)',
              opacity: v > 0 ? (k === 6 ? 1 : 0.42) : 1,
              transformOrigin: 'bottom',
              animation: `barGrow .7s cubic-bezier(.3,1.4,.5,1) ${0.25 + k * 0.06}s both`,
            }}
          />
          <div style={{ fontSize: 11, fontWeight: 600, color: k === 6 ? 'var(--text)' : 'var(--text3)' }}>{date(from + k * 86400000 + 43200000, { weekday: 'narrow' })}</div>
        </div>
      ))}
    </div>
  );
}

/** Habits kept against the plan, as a ring that fills while the number rolls. */
function HabitRing({ pct }: { pct: number }) {
  const size = 66;
  const sw = 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const [on, setOn] = useState(reducedMotion);
  useEffect(() => {
    const id = setTimeout(() => setOn(true), 250);
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--indigo)"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={on ? c * (1 - Math.min(100, pct) / 100) : c}
          style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        <RollingText text={`${num(pct)}%`} delay={0.25} />
      </div>
    </div>
  );
}

function Stat({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <div>
      {/* "7h 24m" fits at 26px; "٧ س ٢٤ د" needs a little less to stay on one line. */}
      <div style={{ height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: value.length > 6 ? 20 : 26, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
        <RollingText text={value} delay={delay} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text)', marginTop: 8 }}>{label}</div>
    </div>
  );
}
