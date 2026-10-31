import React, { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { BackButton, Card } from '../ui';
import { dayKey, fmtClock, greeting, hm, listSep, minutes, money0, moneyShort } from '../lib/format';
import { briefSchedule, buildBrief, hasBriefData, markBriefRead } from '../lib/brief';
import { scheduleBriefs } from '../lib/notify';
import { track } from '../lib/usage';
import { date, getLang, t, tData, tn } from '../i18n';

/**
 * The morning brief: last night, today, money, training and one thing worth
 * noticing, read top to bottom in about a minute. Opening it counts as reading
 * it, so Home stops offering it for the day.
 */
export function Brief() {
  const { state, go, open, mutateOpt, haptic } = useStore();
  const { d } = useData();
  const b = useMemo(
    () =>
      buildBrief(state!, {
        safe: d.safe,
        budgets: d.budgets.map((x) => ({ cat: x.cat, pct: x.pct })),
        reviewCount: d.reviewCount,
      }),
    [state, d.safe, d.budgets, d.reviewCount]
  );
  useEffect(() => {
    markBriefRead();
    track('brief_open');
    // Read before its time today: today's notification has nothing left to say.
    scheduleBriefs(briefSchedule(state!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = (state!.profile.name || '').trim().split(/\s+/)[0] || '';
  const empty = !hasBriefData(state!);

  const toggle = (id: string) => {
    const key = dayKey();
    haptic(12);
    mutateOpt((s) => {
      const has = s.checkins.some((c) => c.habitId === id && c.day === key);
      return { ...s, checkins: has ? s.checkins.filter((c) => !(c.habitId === id && c.day === key)) : [...s.checkins, { habitId: id, day: key }] };
    }, () => api.toggleHabit(id, key)).catch(() => {});
  };

  const left = b.habits.filter((h) => !h.done).length;
  const label = (s: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>{s}</div>;
  const line: React.CSSProperties = { fontSize: 15, color: 'var(--text)', lineHeight: 1.45 };
  const sub: React.CSSProperties = { fontSize: 13, color: 'var(--text2)', lineHeight: 1.45, marginTop: 2 };
  const link: React.CSSProperties = { fontSize: 14, fontWeight: 650, color: 'var(--indigo)', cursor: 'pointer' };
  const when = (n: number) => (n === 0 ? t('due today') : n === 1 ? t('due tomorrow') : tn(n, 'due in {n} day', 'due in {n} days'));
  const ago = (n: number) => (n <= 0 ? t('today') : n === 1 ? t('yesterday') : tn(n, '{n} day ago', '{n} days ago'));

  // The three numbers worth knowing before anything else.
  const glance: { k: string; v: string; s?: string }[] = [];
  if (b.sleep) glance.push({ k: t('Slept'), v: hm(b.sleep.hours) });
  else if (b.sleepTracked) glance.push({ k: t('Slept'), v: '—', s: t('Not logged') });
  if (b.habits.length) glance.push({ k: t('Habits today'), v: String(b.habits.length), s: left ? tn(left, '{n} to go', '{n} to go') : t('All done') });
  if (b.safe) glance.push({ k: t('Safe today'), v: moneyShort(b.safe.perDay) });
  const over = b.budgetsNear.filter((x) => x.pct >= 100).map((x) => tData(x.cat));
  const near = b.budgetsNear.filter((x) => x.pct < 100).slice(0, 2);

  const money = b.spentYesterday > 0 || b.bills.length > 0 || b.budgetsNear.length > 0 || b.toReview > 0 || !!b.safe;

  return (
    <div style={{ padding: '6px 20px 32px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <BackButton onClick={() => go('home')} />
        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{date(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
      <div className="display" style={{ fontSize: 38, lineHeight: 1.08, color: 'var(--text)' }}>
        {greeting()}
        {firstName ? `${getLang() === 'ar' ? '،' : ','} ${firstName}` : ''}
      </div>
      <div style={{ fontSize: 15, color: 'var(--text2)', margin: '8px 2px 22px', lineHeight: 1.45 }}>
        {empty ? t('Once you’ve logged a few days, this is where they come together each morning.') : t('Here’s your day, in a minute.')}
      </div>

      {glance.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${glance.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 24 }}>
          {glance.map((g) => (
            <div key={g.k} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 12px 11px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.k}</div>
              {/* Arabic units ("٧ س ٣٠ د", "٩٫٥ ألف") run wider: a touch smaller, and
                  allowed to wrap at a space rather than be cut off. */}
              <div style={{ fontSize: getLang() === 'ar' ? 18 : 20, lineHeight: 1.2, fontWeight: 700, letterSpacing: getLang() === 'ar' ? 0 : '-.03em', color: 'var(--text)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{g.v.replace(/[\u00a0\u202f]/g, ' ')}</div>
              {g.s && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.s}</div>}
            </div>
          ))}
        </div>
      )}

      {(b.sleep || b.sleepTracked) && (
        <>
          {label(t('Last night'))}
          <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
            {b.sleep ? (
              <>
                <div style={line}>
                  <b style={{ fontWeight: 650 }}>{hm(b.sleep.hours)}</b>
                  {' · '}
                  {t('quality {q}/10', { q: b.sleep.quality })}
                </div>
                <div style={sub}>
                  {[
                    b.sleep.diffMin != null
                      ? b.sleep.diffMin > 0
                        ? t('{time} more than usual', { time: minutes(b.sleep.diffMin) })
                        : t('{time} less than usual', { time: minutes(-b.sleep.diffMin) })
                      : null,
                    b.sleep.bedH != null ? t('in bed at {time}', { time: fmtClock(b.sleep.bedH) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ ...line, flex: 1, color: 'var(--text2)' }}>{t('Not logged yet.')}</div>
                <div role="button" tabIndex={0} onClick={() => open('sleep')} style={link}>
                  {t('Log last night')}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {(b.habits.length > 0 || b.intention) && (
        <>
          {label(t('Today'))}
          <Card style={{ padding: '6px 0', marginBottom: 20 }}>
            {b.intention && (
              <div style={{ padding: '10px 16px', borderBottom: b.habits.length || b.slip ? '1px solid var(--hairline)' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{t('This week')}</div>
                <div style={{ ...line, fontWeight: 600, marginTop: 1 }}>{b.intention}</div>
              </div>
            )}
            {b.slip && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ ...line, fontWeight: 650 }}>{tn(1, 'Don’t miss {name} twice', 'Back to {name}?', { name: tData(b.slip.name) })}</div>
                <div style={sub}>{b.slip.why ? t('You said: “{why}”', { why: b.slip.why }) : t('You missed it last time. Today keeps it going.')}</div>
              </div>
            )}
            {b.habits.map((h, i) => (
              <div
                key={h.id}
                role="checkbox"
                aria-checked={h.done}
                aria-label={tData(h.name)}
                tabIndex={0}
                onClick={() => toggle(h.id)}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    flex: 'none',
                    borderRadius: '50%',
                    transition: 'background .25s, border-color .25s',
                    border: `1.5px solid ${h.done ? 'var(--indigo)' : 'var(--text3)'}`,
                    background: h.done ? 'var(--indigo)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {h.done && (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                    </svg>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...line, fontWeight: 600, color: h.done ? 'var(--text2)' : 'var(--text)' }}>{tData(h.name)}</div>
                  {h.cue && <div style={{ ...sub, marginTop: 0 }}>{h.cue}</div>}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {money && (
        <>
          {label(t('Money'))}
          <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={line}>
                  {b.spentYesterday > 0 ? t('{amount} spent yesterday', { amount: money0(b.spentYesterday) }) : t('Nothing spent yesterday.')}
                </div>
                {b.topYesterday && <div style={sub}>{t('Mostly at {place}', { place: b.topYesterday })}</div>}
              </div>
              {b.safe && (
                <div>
                  <div style={line}>
                    {t('{amount} safe to spend this month', { amount: money0(b.safe.left) })}
                  </div>
                  <div style={sub}>
                    {b.safe.daysLeft === 1
                      ? t('left for today')
                      : t('about {amount} a day for {days}', { amount: money0(b.safe.perDay), days: tn(b.safe.daysLeft, '{n} day', '{n} days') })}
                  </div>
                </div>
              )}
              {b.bills.map((x) => (
                <div key={x.name + x.inDays} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ ...line, flex: 1, minWidth: 0 }}>
                    {x.name}
                    <span style={{ color: 'var(--text2)' }}>{' · ' + when(x.inDays)}</span>
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money0(x.amount)}</div>
                </div>
              ))}
              {over.length > 0 && <div style={{ ...line, color: 'var(--danger)' }}>{t('Over budget this month: {cats}', { cats: over.join(listSep()) })}</div>}
              {near.map((x) => (
                <div key={x.cat} style={line}>
                  {t('{cat}: {pct}% of this month’s budget used', { cat: tData(x.cat), pct: Math.round(x.pct) })}
                </div>
              ))}
              {b.toReview > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ ...line, flex: 1 }}>{tn(b.toReview, 'One payment to check', '{n} payments to check')}</div>
                  <div role="button" tabIndex={0} onClick={() => go('freview')} style={link}>
                    {t('Check')}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {b.training && (
        <>
          {label(t('Training'))}
          <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
            <div style={line}>{t('Last workout: {name}, {when}', { name: tData(b.training.lastName), when: ago(b.training.daysSince) })}</div>
            <div style={sub}>
              {tn(b.training.lastWeek, 'One in the last 7 days', '{n} in the last 7 days')}
              {b.training.usual ? ' · ' + tn(b.training.usual, 'usually one a week', 'usually {n} a week') : ''}
            </div>
          </Card>
        </>
      )}

      {b.insight && (
        <>
          {label(t('Worth noticing'))}
          <Card style={{ padding: '14px 16px', marginBottom: 24 }}>
            <div style={{ ...line, fontWeight: 600 }}>{b.insight.title}</div>
            <div style={sub}>{b.insight.detail}</div>
          </Card>
        </>
      )}

      <div
        tabIndex={0}
        role="button"
        onClick={() => go('home')}
        className="press"
        style={{ background: 'var(--indigo)', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
      >
        {t('Start the day')}
      </div>
    </div>
  );
}
