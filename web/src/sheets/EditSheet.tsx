import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { IconTrash } from '../icons';
import { hm, signMoney } from '../lib/format';
import type { Workout, Night, Txn } from '../types';

export function EditSheet() {
  const { state, sheetData, open, closeSheet, mutate, haptic } = useStore();
  const kind: 'workout' | 'sleep' | 'txn' = sheetData?.kind;
  const item = sheetData?.item;

  const w = kind === 'workout' ? (item as Workout) : null;
  const [catId, setCatId] = useState<string>(w?.catId || state!.wCats[0]?.id || '');
  const [dur, setDur] = useState<number>(w?.dur || 0);
  const [dist, setDist] = useState<string>(w?.dist || '');
  const [kcal, setKcal] = useState<string>(w?.kcal ? String(w.kcal) : '');

  const title =
    kind === 'workout' ? 'Edit workout' : kind === 'sleep' ? 'Edit sleep' : kind === 'txn' ? 'Edit transaction' : 'Edit entry';
  const summary =
    kind === 'workout'
      ? `${(item as Workout).name} · ${(item as Workout).dur} min`
      : kind === 'sleep'
      ? `${hm((item as Night).hours)} · ${(item as Night).quality}/10`
      : kind === 'txn'
      ? `${(item as Txn).name} · ${signMoney((item as Txn).amount)}`
      : '';

  const saveWorkout = async () => {
    haptic();
    await mutate(
      () => api.editWorkout(w!.id, { dur, catId, dist: dist.trim() || null, kcal: kcal ? Number(kcal) : null }),
      'Workout updated'
    );
    closeSheet();
  };

  const del = async () => {
    haptic();
    const id = (item as { id: string }).id;
    const fn =
      kind === 'workout' ? () => api.deleteWorkout(id) : kind === 'sleep' ? () => api.deleteNight(id) : () => api.deleteTxn(id);
    await mutate(fn, 'Entry deleted');
    closeSheet();
  };

  const label = (t: string) => (
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>
  );
  const fieldInput: React.CSSProperties = {
    width: '100%',
    height: 50,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    padding: '0 16px',
    fontSize: 15,
    color: 'var(--text)',
    outline: 'none',
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 18px' }}>{title}</div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '15px 16px', marginBottom: 20, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{summary}</div>

      {kind === 'workout' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Category</span>
            <span onClick={() => open('wcats')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer' }}>Manage</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
            {state!.wCats.map((c) => (
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
            <div onClick={() => setDur(dur + 5)} className="press92" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
              <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 5v10M5 10h10" /></svg>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
            <div style={{ flex: 1 }}>
              {label('Distance')}
              <input value={dist} onChange={(e) => setDist(e.target.value)} placeholder="e.g. 5.2 km" style={fieldInput} />
            </div>
            <div style={{ flex: 1 }}>
              {label('Calories')}
              <input value={kcal} onChange={(e) => setKcal(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="e.g. 312" style={fieldInput} />
            </div>
          </div>

          <div onClick={saveWorkout} className="press" style={{ background: 'var(--coral)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
            Save changes
          </div>
        </>
      )}

      <div onClick={del} className="press99" style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer' }}>
        <IconTrash />
        Delete entry
      </div>
    </div>
  );
}
