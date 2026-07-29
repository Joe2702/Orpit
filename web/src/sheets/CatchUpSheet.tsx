import React from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { dayKey } from '../lib/format';

const D = 86400000;
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Fill in the last 7 days for every habit at once — the fix for coming back
 * from a trip and facing a week of missed check-ins one screen at a time.
 */
export function CatchUpSheet() {
  const { state, mutateOpt, haptic } = useStore();
  const habits = state!.habits.filter((h) => !h.archived && !h.paused);
  const today = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * D);
  const done = new Set(state!.checkins.map((c) => c.habitId + '|' + c.day));

  const toggle = (habitId: string, ds: string) => {
    haptic();
    mutateOpt(
      (s) => {
        const has = s.checkins.some((c) => c.habitId === habitId && c.day === ds);
        return {
          ...s,
          checkins: has
            ? s.checkins.filter((c) => !(c.habitId === habitId && c.day === ds))
            : [...s.checkins, { habitId, day: ds }],
        };
      },
      () => api.toggleHabit(habitId, ds)
    ).catch(() => {});
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 6px' }}>Catch up</div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
        The last 7 days. Tap any square to check it off — handy after a trip or a busy week.
      </div>

      {/* One habit per card: the name gets its own line, and the seven days sit
          below it sharing the full width. Squeezing a name and seven squares
          onto one row leaves the name about 20px wide on a phone. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {habits.map((h) => {
          const mask = /^[01]{7}$/.test(h.days) ? h.days : '1111111';
          return (
            <div
              key={h.id}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '13px 14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', flex: 'none', background: `var(--${h.color})` }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {days.map((t) => {
                  const ds = dayKey(t);
                  const dt = new Date(t);
                  const scheduled = mask[dt.getDay()] === '1';
                  const on = done.has(h.id + '|' + ds);
                  return (
                    <div key={t} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>{WD[dt.getDay()]}</span>
                      <div
                        onClick={() => scheduled && toggle(h.id, ds)}
                        className={scheduled ? 'press92' : undefined}
                        role={scheduled ? 'button' : undefined}
                        aria-label={`${h.name} on ${ds}`}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: scheduled ? 'pointer' : 'default',
                          background: on ? `var(--${h.color})` : 'var(--bg)',
                          border: `1px solid ${on ? `var(--${h.color})` : 'var(--border)'}`,
                          opacity: scheduled ? 1 : 0.3,
                        }}
                      >
                        {on ? (
                          <svg width="14" height="14" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                            <path d="M3 7.5l3 3L11 4" />
                          </svg>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{dt.getDate()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 14, textAlign: 'center' }}>
        Dimmed squares aren't scheduled for that habit.
      </div>
    </div>
  );
}
