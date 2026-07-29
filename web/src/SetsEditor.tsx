import React from 'react';
import type { WorkoutSet } from './types';
import { startRest } from './lib/restTimer';

// Strength logging: exercises, each with its own sets of reps × weight.
//
// The stored shape is a flat `WorkoutSet[]` — one row per set, carrying its
// exercise name. Flat keeps the JSONB column and the API trivial; the grouping
// into exercise cards happens here, at display time, by walking the list in
// order. Two blocks of the same exercise name stay separate, which is what a
// superset or a "back to bench at the end" actually is.

type Group = { ex: string; rows: { set: WorkoutSet; i: number }[] };

function group(sets: WorkoutSet[]): Group[] {
  const out: Group[] = [];
  sets.forEach((set, i) => {
    const last = out[out.length - 1];
    if (last && last.ex === set.ex) last.rows.push({ set, i });
    else out.push({ ex: set.ex, rows: [{ set, i }] });
  });
  return out;
}

/** Total volume (reps × weight) — the one number that says "harder than last time". */
export function volume(sets: WorkoutSet[] | null | undefined): number {
  if (!sets) return 0;
  return sets.reduce((a, s) => a + s.reps * (s.weight || 0), 0);
}

export function SetsEditor({
  sets,
  onChange,
  restSeconds = 90,
}: {
  sets: WorkoutSet[];
  onChange: (next: WorkoutSet[]) => void;
  restSeconds?: number;
}) {
  const groups = group(sets);

  const patch = (i: number, p: Partial<WorkoutSet>) =>
    onChange(sets.map((s, k) => (k === i ? { ...s, ...p } : s)));

  const removeAt = (i: number) => onChange(sets.filter((_, k) => k !== i));

  // A new set copies the one above it — the common case is the same weight
  // again, and pre-filling beats retyping every single time.
  const addSet = (g: Group) => {
    const prev = g.rows[g.rows.length - 1].set;
    const at = g.rows[g.rows.length - 1].i + 1;
    const next = [...sets];
    next.splice(at, 0, { ex: g.ex, reps: prev.reps, weight: prev.weight });
    onChange(next);
    startRest(restSeconds); // logging a set means the rest has begun
  };

  const addExercise = () => onChange([...sets, { ex: '', reps: 10, weight: null }]);

  const renameGroup = (g: Group, name: string) =>
    onChange(sets.map((s, k) => (g.rows.some((r) => r.i === k) ? { ...s, ex: name } : s)));

  const removeGroup = (g: Group) => onChange(sets.filter((_, k) => !g.rows.some((r) => r.i === k)));

  const numField = (value: string, onValue: (v: string) => void, placeholder: string) => (
    <input
      value={value}
      onChange={(e) => onValue(e.target.value.replace(/[^0-9.]/g, ''))}
      inputMode="decimal"
      placeholder={placeholder}
      style={{ width: '100%', height: 40, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', padding: '0 10px', fontSize: 15, fontWeight: 600, color: 'var(--text)', outline: 'none', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
    />
  );

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 13, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              value={g.ex}
              onChange={(e) => renameGroup(g, e.target.value)}
              placeholder="Exercise name"
              maxLength={60}
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', padding: '0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
            />
            <div onClick={() => removeGroup(g)} className="press92" role="button" aria-label={`Remove ${g.ex || 'exercise'}`} style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}>
              <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 6, paddingLeft: 26, fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span style={{ flex: 1 }}>Reps</span>
            <span style={{ flex: 1 }}>Weight</span>
            <span style={{ width: 34, flex: 'none' }} />
          </div>

          {g.rows.map((r, ri) => (
            <div key={r.i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 18, flex: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{ri + 1}</span>
              <div style={{ flex: 1 }}>{numField(r.set.reps ? String(r.set.reps) : '', (v) => patch(r.i, { reps: Math.min(9999, parseInt(v, 10) || 0) }), '10')}</div>
              <div style={{ flex: 1 }}>{numField(r.set.weight != null ? String(r.set.weight) : '', (v) => patch(r.i, { weight: v === '' ? null : Math.min(9999, parseFloat(v) || 0) }), '—')}</div>
              <div onClick={() => removeAt(r.i)} className="press92" role="button" aria-label={`Remove set ${ri + 1}`} style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M4 7.5h7" /></svg>
              </div>
            </div>
          ))}

          <div onClick={() => addSet(g)} className="pressRow" role="button" style={{ marginTop: 4, height: 38, borderRadius: 11, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer' }}>
            <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2.3, strokeLinecap: 'round' }}><path d="M7.5 3v9M3 7.5h9" /></svg>
            Add set
          </div>
        </div>
      ))}

      <div onClick={addExercise} className="press99" role="button" style={{ height: 46, borderRadius: 14, border: '1.5px dashed color-mix(in srgb,var(--coral) 40%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14.5, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer', background: 'color-mix(in srgb,var(--coral) 6%,transparent)' }}>
        <svg width="17" height="17" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M8.5 3.5v10M3.5 8.5h10" /></svg>
        {sets.length ? 'Add exercise' : 'Add exercises, sets & reps'}
      </div>
    </div>
  );
}
