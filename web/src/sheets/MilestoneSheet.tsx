import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { IconTrash } from '../icons';
import { CIcon, CTR_ICONS } from '../lib/iconPaths';
import { elapsed, formatElapsed } from '../lib/since';

const label = (t: string) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>
);
const input: React.CSSProperties = {
  width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--border)',
  background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none',
};
const swatch = (c: string, active: boolean): React.CSSProperties => ({
  width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none',
  background: `var(--${c})`, transition: 'all .15s',
  boxShadow: active ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent',
});

/** Local YYYY-MM-DD — toISOString would hand back yesterday west of Greenwich. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A few starting points, because the blank form doesn't suggest what this is
// for. "Since born" is the one that makes the feature click.
const SUGGESTIONS: { name: string; icon: string; color: string }[] = [
  { name: 'No sugar', icon: 'drop', color: 'teal' },
  { name: 'Vegan', icon: 'flame', color: 'emerald' },
  { name: 'Together', icon: 'heart', color: 'coral' },
  { name: 'Since born', icon: 'star', color: 'indigo' },
  { name: 'Sober', icon: 'target', color: 'blue' },
  { name: 'Quit smoking', icon: 'bolt', color: 'warning' },
];

export function MilestoneSheet() {
  const { sheetData, closeSheet, mutate, haptic } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState<string>(sheetData?.name ?? '');
  const [since, setSince] = useState<string>(sheetData?.since ?? todayISO());
  const [color, setColor] = useState<string>(sheetData?.color ?? 'indigo');
  const [icon, setIcon] = useState<string>(sheetData?.icon ?? 'star');

  const canSave = !!name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(since);
  // Noon, so the date can't drift a day either way through a timezone.
  const preview = canSave ? formatElapsed(elapsed(new Date(`${since}T12:00:00`).getTime())) : '';

  const save = () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), since, color, icon };
    mutate(
      () => (editId ? api.editMilestone(editId, body) : api.addMilestone(body)),
      editId ? 'Milestone updated' : 'Milestone added'
    ).catch(() => {});
    closeSheet();
  };

  const del = () => {
    if (!editId) return;
    haptic();
    mutate(() => api.deleteMilestone(editId), 'Milestone removed').catch(() => {});
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>
        {editId ? 'Edit milestone' : 'Counting since'}
      </div>

      {!editId && (
        <>
          {label('Suggestions')}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
            {SUGGESTIONS.map((s) => (
              <div
                key={s.name}
                onClick={() => { setName(s.name); setIcon(s.icon); setColor(s.color); }}
                style={{ ...chip(false, `var(--${s.color})`), flex: 'none' }}
              >
                {s.name}
              </div>
            ))}
          </div>
        </>
      )}

      {label('What are you counting?')}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. No sugar"
        maxLength={60}
        style={{ ...input, marginBottom: 20 }}
      />

      {label('Since')}
      {/* No `max` on the date: the whole point is entering something long past,
          and a birth date is decades back. A future date is caught on save. */}
      <input
        type="date"
        value={since}
        onChange={(e) => e.target.value && setSince(e.target.value)}
        style={{ ...input, fontWeight: 600 }}
      />
      <div style={{ fontSize: 13, color: preview ? `var(--${color})` : 'var(--text2)', fontWeight: 600, margin: '10px 2px 20px', minHeight: 18 }}>
        {preview}
      </div>

      {label('Colour')}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, paddingLeft: 2 }}>
        {['indigo', 'teal', 'coral', 'blue', 'emerald', 'warning'].map((c) => (
          <div key={c} onClick={() => setColor(c)} style={{ ...swatch(c, color === c), width: 34, height: 34 }} />
        ))}
      </div>

      {label('Icon')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9, marginBottom: 24 }}>
        {CTR_ICONS.map((ic) => (
          <div
            key={ic}
            onClick={() => setIcon(ic)}
            style={{
              width: '100%', aspectRatio: '1', borderRadius: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', transition: 'all .15s',
              border: `1px solid ${icon === ic ? `var(--${color})` : 'var(--border)'}`,
              background: icon === ic ? `color-mix(in srgb,var(--${color}) 12%,var(--surface))` : 'var(--surface)',
            }}
          >
            <CIcon icon={ic} color={icon === ic ? `var(--${color})` : 'var(--text2)'} size={20} />
          </div>
        ))}
      </div>

      <div
        onClick={save}
        className={canSave ? 'press99' : undefined}
        style={{
          background: canSave ? `var(--${color})` : `color-mix(in srgb,var(--${color}) 40%,var(--surface))`,
          color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: canSave ? 'pointer' : 'default',
        }}
      >
        {editId ? 'Save changes' : 'Start counting'}
      </div>
      {editId && (
        <div
          onClick={del}
          className="press99"
          style={{
            height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15,
            fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10,
          }}
        >
          <IconTrash />Remove
        </div>
      )}
    </div>
  );
}
