import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Ring, Heat } from '../lib/charts';
import { Card, DetailHeader, RangeSeg, SectionLabel } from '../ui';
import { DAY_LETTERS } from '../lib/period';
import { daysLabel } from '../lib/format';
import { IconPencil } from '../icons';
import { Reorderable } from '../Reorderable';
import { api } from '../api';
import { Glyph } from '../lib/appIcons';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Habits() {
  const { open, mutate } = useStore();
  const { h } = useData();
  const todayDow = new Date().getDay();

  const legendSwatch = (pct: string) => (
    <span style={{ width: 11, height: 11, borderRadius: 3, background: pct }} />
  );

  const habitCard = (hb: (typeof h.habits)[number]) => {
    const col = `var(--${hb.color})`;
    return (
      <div
        onClick={() => !hb.locked && open('habit', { id: hb.id, name: hb.name, color: hb.color, target: hb.target, days: hb.days, why: hb.why, paused: hb.paused, reminderTime: hb.reminderTime })}
        className={hb.locked ? undefined : 'press99'}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: hb.locked ? 'default' : 'pointer', opacity: hb.paused ? 0.6 : 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', flex: 'none', background: col }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {hb.name}
              {hb.paused && <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 650, marginLeft: 8, padding: '2px 7px', borderRadius: 6, background: 'color-mix(in srgb,var(--warning) 14%,transparent)' }}>Paused</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {daysLabel(hb.days)}
              {/* A habit with its own reminder says so here. The setting lived
                  only at the bottom of the edit sheet, so there was no way to
                  tell which habits would actually nudge you — and no reason to
                  believe the one you set had stuck. */}
              {hb.reminderTime && !hb.paused && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: col, fontWeight: 600 }}>
                  <svg width="11" height="11" style={{ fill: 'none', stroke: col, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                    <path d="M5.5 2.2a3 3 0 0 0-3 3v2l-1 1.6h8L8.5 7.2v-2a3 3 0 0 0-3-3ZM4 10.2a1.6 1.6 0 0 0 3 0" />
                  </svg>
                  {hb.reminderTime}
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', flex: 'none', fontVariantNumeric: 'tabular-nums' }} title="Days completed, all time">
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{hb.total}</span> {hb.total === 1 ? 'day' : 'days'}
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
                aria-label={`${DAY_NAMES[wd]}: ${on ? 'done' : ahead ? 'coming up' : isToday ? 'not yet' : 'missed'}`}
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
                  <svg width="13" height="13" viewBox="0 0 12 12" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                    <path d="M3 6.5l2 2 4-4.5" />
                  </svg>
                ) : (
                  DAY_LETTERS[wd]
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
      <DetailHeader
        title="Habits"
        iconColor="teal"
        icon={
          <svg width="22" height="22" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l2.5 2.5L16 9" />
          </svg>
        }
      />
      {/* This week, always — the habit loop lives in the current week, so its
          card doesn't move with the range control further down. */}
      <Card style={{ padding: '16px 18px', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)' }}>This week</div>
        <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--text)', marginTop: 6, lineHeight: 1.3 }}>
          {h.weekPlanned === 0
            ? 'Nothing scheduled this week'
            : h.weekSecured
            ? 'This week counts'
            : `${h.weekToGo} more ${h.weekToGo === 1 ? 'check-in' : 'check-ins'} to make it count`}
        </div>
        {h.weekPlanned > 0 && (
          <>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--hairline)', marginTop: 14, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (h.weekDone / h.weekPlanned) * 100)}%`, background: 'var(--teal)', borderRadius: 4, transition: 'width .4s ease' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(h.weekGoal / h.weekPlanned) * 100}%`, width: 2, background: 'var(--surface)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
              <span>
                <b style={{ color: 'var(--text)', fontWeight: 650 }}>{h.weekDone}</b> of {h.weekPlanned} done
              </span>
              <span>Counts at {h.weekGoal}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--hairline)' }}>
          <Glyph name={h.weekStreak > 0 ? 'flame' : 'sprout'} size={18} color="var(--teal)" />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.4 }}>
            {h.weekStreak > 0 ? (
              <>
                <b style={{ color: 'var(--text)', fontWeight: 650 }}>
                  {h.weekStreak} good {h.weekStreak === 1 ? 'week' : 'weeks'}
                </b>{' '}
                in a row
              </>
            ) : (
              'A week counts at 70% — one slow day won’t break your run'
            )}
          </span>
        </div>
      </Card>

      <div
        onClick={() => open('catchup')}
        className="press99"
        role="button"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 46, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: 22 }}
      >
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }} aria-hidden>
          <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
          <path d="M2.5 7h13M6 1.5v3M12 1.5v3M6.5 11l1.6 1.6L12 9" />
        </svg>
        <span style={{ flex: 1 }}>Fill in the last 7 days</span>
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M7 4l5 5-5 5" />
        </svg>
      </div>

      <SectionLabel>Your habits</SectionLabel>
      <Reorderable
        items={h.habits.map((hb) => ({ id: hb.id, node: <div style={{ marginBottom: 10 }}>{habitCard(hb)}</div> }))}
        onReorder={(ids) => mutate(() => api.reorderHabits(ids)).catch(() => {})}
      />
      <div
        onClick={() => open('habit')}
        className="press99"
        role="button"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 16, border: '1.5px dashed color-mix(in srgb,var(--teal) 40%,var(--border))', color: 'var(--teal)', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'color-mix(in srgb,var(--teal) 6%,transparent)', marginBottom: 6 }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2.2, strokeLinecap: 'round' }} aria-hidden>
          <path d="M10 4v12M4 10h12" />
        </svg>
        Add a habit
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', margin: '8px 0 26px' }}>Hold a habit to move it</div>

      <SectionLabel>History</SectionLabel>
      <RangeSeg period={h.period} />
      <Card style={{ padding: 18, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 96, height: 96, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={h.rangePct} colorKey="teal" size={96} stroke={10} />
          <div style={{ position: 'absolute', fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.03em' }}>
            {h.rangePct}
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>%</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)' }}>
            {h.rangeTotal ? `${h.rangeDone} of ${h.rangeTotal} check-ins` : 'Nothing scheduled'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{h.period.caption}</div>
          {h.longestStreak > 1 && (
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 8 }}>
              Longest run: <b style={{ color: 'var(--text)', fontWeight: 650 }}>{h.longestStreak} days</b>
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)', marginBottom: 14 }}>Last 12 weeks</div>
        <div style={{ overflow: 'hidden' }}>
          <Heat grid={h.grid} colorKey="teal" cell={13} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--text2)' }}>
          <span>Less</span>
          {legendSwatch('color-mix(in srgb,var(--text2) 12%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--teal) 40%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--teal) 70%,transparent)')}
          {legendSwatch('var(--teal)')}
          <span>More</span>
        </div>
      </Card>

    </div>
  );
}
