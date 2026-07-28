import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';

// Local YYYY-MM-DD (not UTC) for the date input's default.
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function WorkoutSheet() {
  const { state, open, closeSheet, mutateOpt, haptic } = useStore();
  const cats = state!.wCats;
  const [catId, setCatId] = useState(cats[0]?.id || '');
  const [dur, setDur] = useState(30);
  const [intensity, setIntensity] = useState('Moderate');
  const [day, setDay] = useState(todayISO());

  // Most recent workout — offered as a one-tap repeat, the most common case.
  const last = state!.workouts.length
    ? [...state!.workouts].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const lastCatName = cats.find((c) => c.id === last?.catId)?.name || last?.name || 'Workout';

  const log = (o: { catId: string; dur: number; intensity: string | null; ts: number }) => {
    const catName = cats.find((c) => c.id === o.catId)?.name || 'Workout';
    const tempId = 'tmp_' + Date.now();
    mutateOpt(
      (s) => ({
        ...s,
        workouts: [...s.workouts, { id: tempId, name: catName, catId: o.catId, dur: o.dur, dist: null, kcal: null, intensity: o.intensity, ts: o.ts }],
      }),
      () => api.addWorkout({ catId: o.catId, dur: o.dur, dist: null, kcal: null, intensity: o.intensity, ts: o.ts }),
      'Workout logged'
    ).catch(() => {});
    closeSheet();
  };

  const save = () => {
    if (!catId) return;
    haptic();
    log({ catId, dur, intensity, ts: new Date(`${day}T12:00:00`).getTime() });
  };

  const repeatLast = () => {
    if (!last?.catId) return;
    haptic();
    log({ catId: last.catId, dur: last.dur, intensity: last.intensity, ts: Date.now() });
  };

  const label = (t: string) => (
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>
  );

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>Log workout</div>
        <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
          <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <rect x="2" y="3" width="11" height="10" rx="2" />
            <path d="M2 6h11M5 1.5v3M10 1.5v3" />
          </svg>
          {day === todayISO() ? 'Today' : new Date(`${day}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          <input
            type="date"
            value={day}
            max={todayISO()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 'none', cursor: 'pointer' }}
          />
        </label>
      </div>

      {last && (
        <div
          onClick={repeatLast}
          className="press99"
          role="button"
          style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'color-mix(in srgb,var(--coral) 10%,var(--surface))', border: '1px solid color-mix(in srgb,var(--coral) 30%,var(--border))', borderRadius: 16, padding: '13px 15px', marginBottom: 20, cursor: 'pointer' }}
        >
          <span style={{ width: 34, height: 34, borderRadius: 11, flex: 'none', background: 'color-mix(in srgb,var(--coral) 16%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M4 8a5 5 0 0 1 9-2M13 4v3h-3M14 10a5 5 0 0 1-9 2M4 15v-3h3" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>Repeat last workout</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
              {lastCatName} · {last.dur} min{last.intensity ? ` · ${last.intensity}` : ''}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Category</span>
        <span onClick={() => open('wcats')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer' }}>Manage</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
        {cats.map((c) => (
          <div key={c.id} onClick={() => setCatId(c.id)} style={chip(catId === c.id, `var(--${c.color})`)}>
            {c.name}
          </div>
        ))}
      </div>

      {label('Duration')}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, marginBottom: 22 }}>
        <div onClick={() => setDur(Math.max(5, dur - 5))} className="press92" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M5 10h10" /></svg>
        </div>
        <div style={{ textAlign: 'center', minWidth: 96 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{dur}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)' }}> min</span>
        </div>
        <div onClick={() => setDur(dur + 5)} className="press92" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', boxShadow: '0 6px 12px -6px rgba(40,36,28,.20)' }}>
          <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 5v10M5 10h10" /></svg>
        </div>
      </div>

      {label('Intensity')}
      <div style={{ display: 'flex', gap: 9, marginBottom: 22 }}>
        {['Easy', 'Moderate', 'Hard'].map((t) => (
          <div key={t} onClick={() => setIntensity(t)} style={{ ...chip(intensity === t, 'var(--coral)'), flex: 1, textAlign: 'center' }}>
            {t}
          </div>
        ))}
      </div>

      <div onClick={save} className="press" style={{ background: 'var(--coral)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)' }}>
        Save workout
      </div>
    </div>
  );
}
