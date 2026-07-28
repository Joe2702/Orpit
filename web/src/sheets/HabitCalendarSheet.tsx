import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

// A month-by-month calendar of a single habit's check-ins, opened from Analytics.
// Tap any past day to fill in (or clear) a missed check-in.
export function HabitCalendarSheet() {
  const { state, sheetData, mutateOpt, haptic } = useStore();
  const habitId: string = sheetData?.habitId;
  const habit = state!.habits.find((h) => h.id === habitId);
  const col = `var(--${habit?.color || 'teal'})`;
  const doneDays = new Set(state!.checkins.filter((c) => c.habitId === habitId).map((c) => c.day));
  const [offset, setOffset] = useState(0); // months back from the current month

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const year = month.getFullYear();
  const mo = month.getMonth();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const firstWd = new Date(year, mo, 1).getDay();
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().slice(0, 10);

  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) if (doneDays.has(`${year}-${pad(mo + 1)}-${pad(d)}`)) count++;

  // Tap a past (or today's) day to toggle its check-in — lets users backfill days
  // they missed. Optimistic so it flips instantly.
  const toggle = (ds: string) => {
    if (ds > todayStr) return; // can't check off the future
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 18px' }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: col, flex: 'none' }} />
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{habit?.name || 'Habit'}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '13px 15px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: col }}>{count}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>this month</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '13px 15px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{doneDays.size}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>all time</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div onClick={() => setOffset(offset + 1)} className="press92" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M11 4l-5 5 5 5" /></svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{monthLabel}</div>
        <div onClick={() => offset > 0 && setOffset(offset - 1)} className="press92" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: offset > 0 ? 'pointer' : 'default', opacity: offset > 0 ? 1 : 0.4 }}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M7 4l5 5-5 5" /></svg>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
        {WD.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const ds = `${year}-${pad(mo + 1)}-${pad(day)}`;
          const done = doneDays.has(ds);
          const isToday = ds === todayStr;
          const scheduled = (habit?.days || '1111111')[new Date(year, mo, day).getDay()] === '1';
          const future = ds > todayStr;
          return (
            <div
              key={i}
              onClick={() => toggle(ds)}
              className={future ? undefined : 'press92'}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                cursor: future ? 'default' : 'pointer',
                background: done ? col : 'var(--bg)',
                color: done ? '#fff' : 'var(--text)',
                border: isToday && !done ? `1.5px solid ${col}` : '1px solid var(--border)',
                opacity: future ? 0.35 : done || scheduled ? 1 : 0.55,
              }}
            >
              {done ? (
                <svg width="15" height="15" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M3 8l3.2 3.2L13 4.5" /></svg>
              ) : (
                day
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 16, textAlign: 'center', lineHeight: 1.5 }}>
        Tap any day to check it off or clear it — backfill days you missed.
      </div>
    </div>
  );
}
