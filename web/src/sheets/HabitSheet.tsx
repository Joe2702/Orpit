import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { IconTrash } from '../icons';

const COLORS = ['teal', 'indigo', 'coral', 'blue', 'emerald'];
const TARGETS = ['Daily', '3 / week', '5 / week'];

export function HabitSheet() {
  const { sheetData, closeSheet, mutate, haptic } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState<string>(sheetData?.name ?? '');
  const [color, setColor] = useState<string>(sheetData?.color ?? 'teal');
  const [target, setTarget] = useState<string>(sheetData?.target ?? 'Daily');

  const canSave = !!name.trim();

  const save = async () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), color, target };
    await mutate(
      () => (editId ? api.editHabit(editId, body) : api.addHabit(body)),
      editId ? 'Habit updated' : 'Habit added'
    );
    closeSheet();
  };

  const del = async () => {
    if (!editId) return;
    haptic();
    await mutate(() => api.deleteHabit(editId), 'Habit deleted');
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>
        {editId ? 'Edit habit' : 'Add habit'}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Name</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Morning walk"
        style={{ width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none', marginBottom: 22 }}
      />

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>Color</div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, paddingLeft: 2 }}>
        {COLORS.map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: color === c ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }}
          />
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Target</div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 8 }}>
        {TARGETS.map((t) => (
          <div key={t} onClick={() => setTarget(t)} style={{ ...chip(target === t, 'var(--teal)'), flex: 1, textAlign: 'center' }}>
            {t}
          </div>
        ))}
      </div>

      <div
        onClick={save}
        style={{ background: canSave ? 'var(--teal)' : 'color-mix(in srgb,var(--teal) 40%,var(--surface))', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: canSave ? 'pointer' : 'default', marginTop: 8, transition: 'all .2s' }}
      >
        {editId ? 'Save changes' : 'Create habit'}
      </div>

      {editId && (
        <div onClick={del} className="press99" style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />
          Delete habit
        </div>
      )}
    </div>
  );
}
