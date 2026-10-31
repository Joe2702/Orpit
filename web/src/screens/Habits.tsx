import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Ring, Heat } from '../lib/charts';
import { Card, DetailHeader, RangeSeg, SectionLabel } from '../ui';
import { dayLetter, dayName } from '../lib/period';
import { daysLabel } from '../lib/format';
import { IconPencil } from '../icons';
import { Reorderable } from '../Reorderable';
import { api } from '../api';
import { Glyph } from '../lib/appIcons';
import { t, tData, tn } from '../i18n';

/** Repetitions to automaticity, on average (Lally et al., 2010: median 66 days). */
const FORMED = 66;

export function Habits() {
  const { open, mutate } = useStore();
  const { h } = useData();
  const todayDow = new Date().getDay();

  const legendSwatch = (pct: string) => (
    <span style={{ width: 11, height: 11, borderRadius: 3, background: pct }} />
  );

  const habitCard = (hb: (typeof h.habits)[number]) => {
    // The habit's own colour is a small dot, nothing more; every mark of
    // progress uses the accent, so a screen of habits isn't a rainbow.
    const col = 'var(--indigo)';
    const strength = Math.min(1, hb.total / FORMED);
    return (
      <div role="button" tabIndex={0}
        onClick={() => !hb.locked && open('habit', { id: hb.id, name: hb.name, color: hb.color, target: hb.target, days: hb.days, why: hb.why, cue: hb.cue, paused: hb.paused, reminderTime: hb.reminderTime })}
        className={hb.locked ? undefined : 'press99'}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: hb.locked ? 'default' : 'pointer', opacity: hb.paused ? 0.6 : 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: `var(--${hb.color})` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {tData(hb.name)}
              {hb.paused && <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 650, marginInlineStart: 8, padding: '2px 7px', borderRadius: 'calc(6px * var(--sq))', background: 'color-mix(in srgb,var(--warning) 14%,transparent)' }}>{t('Paused')}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1, minWidth: 0 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{hb.cue || daysLabel(hb.days)}</span>
              {/* A habit with its own reminder says so here. The setting lived
                  only at the bottom of the edit sheet, so there was no way to
                  tell which habits would actually nudge you — and no reason to
                  believe the one you set had stuck. */}
              {hb.reminderTime && !hb.paused && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text2)', fontWeight: 600, flex: 'none' }}>
                  <svg width="11" height="11" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                    <path d="M5.5 2.2a3 3 0 0 0-3 3v2l-1 1.6h8L8.5 7.2v-2a3 3 0 0 0-3-3ZM4 10.2a1.6 1.6 0 0 0 3 0" />
                  </svg>
                  {hb.reminderTime}
                </span>
              )}
            </div>
          </div>
          {/* Habit strength. Automaticity builds over roughly 66 repetitions on
              average (Lally et al., 2010), and a missed day barely dents it, so
              the count of days done is the honest measure, not a streak. */}
          <div style={{ flex: 'none', textAlign: 'end' }} title={t('Days completed, all time')}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
              {strength >= 1 ? t('Second nature') : t('{total} of {FORMED} days', { total: hb.total, FORMED })}
            </div>
            {strength < 1 && (
              <div style={{ width: 64, height: 3, borderRadius: 2, background: 'var(--hairline)', marginTop: 5, marginInlineStart: 'auto', overflow: 'hidden' }}>
                <div style={{ width: `${strength * 100}%`, height: '100%', background: 'var(--indigo)', borderRadius: 2 }} />
              </div>
            )}
          </div>
          {hb.locked ? (
            <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <rect x="3" y="6.5" width="9" height="6.5" rx="1.5" />
              <path d="M5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" />
            </svg>
          ) : (
            <IconPencil />
          )}
        </div>
        {/* This week, one circle per scheduled day, each with its letter, so
            it's plain which circle is today and which days are still ahead. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hb.weekSlots.map((on, i) => {
            const wd = hb.weekDays[i];
            const isToday = wd === todayDow;
            const ahead = wd > todayDow;
            return (
              <span
                key={i}
                aria-label={`${dayName(wd)}: ${on ? t('done') : ahead ? t('coming up') : isToday ? t('not yet') : t('missed')}`}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: on ? col : 'transparent',
                  border: `1.5px ${ahead ? 'dashed' : 'solid'} ${on ? col : isToday ? col : 'var(--border)'}`,
                  fontSize: 11,
                  fontWeight: 650,
                  color: isToday ? col : ahead ? 'var(--text3)' : 'var(--text2)',
                }}
              >
                {on ? (
                  <svg width="13" height="13" viewBox="0 0 12 12" style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                    <path d="M3 6.5l2 2 4-4.5" />
                  </svg>
                ) : (
                  dayLetter(wd)
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title={t('Habits')} />
      {/* This week, always — the habit loop lives in the current week, so its
          card doesn't move with the range control further down. */}
      <Card style={{ padding: '16px 18px', marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>{t('This week')}</div>
        <div className="display" style={{ fontSize: 26, color: 'var(--text)', marginTop: 4, lineHeight: 1.15 }}>
          {h.weekPlanned === 0
            ? t('Nothing scheduled this week')
            : h.weekSecured
            ? t('This week counts')
            : tn(h.weekToGo, '{n} more check-in to make it count', '{n} more check-ins to make it count')}
        </div>
        {h.weekPlanned > 0 && (
          <>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--hairline)', marginTop: 14, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (h.weekDone / h.weekPlanned) * 100)}%`, background: 'var(--indigo)', borderRadius: 4, transition: 'width .4s ease' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, insetInlineStart: `${(h.weekGoal / h.weekPlanned) * 100}%`, width: 2, background: 'var(--surface)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
              <span>
                {t('{done} of {planned} done', { done: h.weekDone, planned: h.weekPlanned })}
              </span>
              <span>{t('Counts at {weekGoal}', { weekGoal: h.weekGoal })}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--hairline)' }}>
          <Glyph name={h.weekStreak > 0 ? 'flame' : 'sprout'} size={18} color="var(--indigo)" />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.4 }}>
            {h.weekStreak > 0 ? (
              tn(h.weekStreak, '{n} good week in a row', '{n} good weeks in a row')
            ) : (
              t('A week counts at 70%, so one slow day won’t break your run')
            )}
          </span>
        </div>
      </Card>

      <div tabIndex={0}
        onClick={() => open('catchup')}
        className="press99"
        role="button"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 46, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: 22 }}
      >
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }} aria-hidden>
          <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
          <path d="M2.5 7h13M6 1.5v3M12 1.5v3M6.5 11l1.6 1.6L12 9" />
        </svg>
        <span style={{ flex: 1 }}>{t('Fill in the last 7 days')}</span>
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path className="flip-rtl" d="M7 4l5 5-5 5" />
        </svg>
      </div>

      <SectionLabel>{t('Your habits')}</SectionLabel>
      <Reorderable
        items={h.habits.map((hb) => ({ id: hb.id, node: <div style={{ marginBottom: 10 }}>{habitCard(hb)}</div> }))}
        onReorder={(ids) => mutate(() => api.reorderHabits(ids)).catch(() => {})}
      />
      <div tabIndex={0}
        onClick={() => open('habit')}
        className="press99"
        role="button"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 'calc(16px * var(--sq))', border: '1.5px dashed color-mix(in srgb,var(--indigo) 40%,var(--border))', color: 'var(--indigo)', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'color-mix(in srgb,var(--indigo) 6%,transparent)', marginBottom: 6 }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }} aria-hidden>
          <path d="M10 4v12M4 10h12" />
        </svg>
        {t('Add a habit')}
      </div>
      <div style={{ height: 20 }} />

      <SectionLabel>{t('History')}</SectionLabel>
      <RangeSeg period={h.period} />
      <Card style={{ padding: 18, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 96, height: 96, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={h.rangePct} colorKey="indigo" size={96} stroke={10} />
          <div style={{ position: 'absolute', fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.03em' }}>
            {h.rangePct}
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>%</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)' }}>
            {h.rangeTotal ? t('{rangeDone} of {rangeTotal} check-ins', { rangeDone: h.rangeDone, rangeTotal: h.rangeTotal }) : t('Nothing scheduled')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{h.period.caption}</div>
          {h.longestStreak > 1 && (
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 8 }}>
              {t('Longest run:') + ' '}<b style={{ color: 'var(--text)', fontWeight: 650 }}>{t('{longestStreak} days', { longestStreak: h.longestStreak })}</b>
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 14 }}>{t('Last 12 weeks')}</div>
        <div style={{ overflow: 'hidden' }}>
          <Heat grid={h.grid} colorKey="indigo" cell={13} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--text2)' }}>
          <span>{t('Less')}</span>
          {legendSwatch('color-mix(in srgb,var(--text2) 12%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--indigo) 40%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--indigo) 70%,transparent)')}
          {legendSwatch('var(--indigo)')}
          <span>{t('More')}</span>
        </div>
      </Card>

    </div>
  );
}
