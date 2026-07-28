import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { daysLabel } from '../lib/format';
import { HABIT_PRESETS } from '../lib/presets';
import { IconTrash } from '../icons';
import { toggleTrack, toggleKnob } from '../ui';

const COLORS = ['teal', 'indigo', 'coral', 'blue', 'emerald', 'purple', 'pink', 'amber', 'cyan', 'rose'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat

export function HabitSheet() {
  const { sheetData, closeSheet, mutateOpt, haptic, confirm, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState<string>(sheetData?.name ?? '');
  const [color, setColor] = useState<string>(sheetData?.color ?? 'teal');
  const [days, setDays] = useState<string>(
    /^[01]{7}$/.test(sheetData?.days) ? sheetData.days : '1111111'
  );
  const [why, setWhy] = useState<string>(sheetData?.why ?? '');
  const [hReminder, setHReminder] = useState<string>(sheetData?.reminderTime ?? '');
  const [paused, setPaused] = useState<boolean>(!!sheetData?.paused);

  const toggleDay = (i: number) => {
    const arr = days.split('');
    arr[i] = arr[i] === '1' ? '0' : '1';
    const next = arr.join('');
    if (next.includes('1')) setDays(next); // keep at least one day on
  };

  const canSave = !!name.trim();

  // The schedule label is derived from the chosen days (replaces the old target picker).
  // An optimistic row still carries a temporary id until the server replies —
  // editing it then would hit a record that doesn't exist yet.
  const pending = !!editId && editId.startsWith('tmp_');

  const save = () => {
    if (!canSave) return;
    if (pending) {
      showToast('Still saving — try again in a moment');
      return;
    }
    haptic();
    const body = {
      name: name.trim(),
      color,
      target: daysLabel(days),
      days,
      why: why.trim() || null,
      reminderTime: hReminder || null,
      paused,
      archived: false,
    };
    if (editId) {
      mutateOpt(
        (s) => ({ ...s, habits: s.habits.map((hb) => (hb.id === editId ? { ...hb, ...body } : hb)) }),
        () => api.editHabit(editId, body),
        'Habit updated'
      ).catch(() => {});
    } else {
      const tempId = 'tmp_' + Date.now();
      mutateOpt(
        (s) => ({
          ...s,
          habits: [
            ...s.habits,
            { id: tempId, ...body, locked: false, paused: false, archived: false, why: body.why ?? null, reminderTime: body.reminderTime ?? null },
          ],
        }),
        () => api.addHabit(body),
        'Habit added'
      ).catch(() => {});
    }
    closeSheet();
  };

  // Archiving hides the habit but keeps every check-in — the safe alternative
  // to deleting, which destroys history for good.
  const archive = async () => {
    if (!editId) return;
    if (!(await confirm({
      title: 'Archive this habit?',
      message: "It disappears from your lists, but its history is kept. You can't undo this from the app yet.",
      confirmLabel: 'Archive',
    }))) return;
    haptic();
    mutateOpt(
      (s) => ({ ...s, habits: s.habits.map((hb) => (hb.id === editId ? { ...hb, archived: true } : hb)) }),
      () => api.editHabit(editId, { name: name.trim(), color, target: daysLabel(days), days, why: why.trim() || null, reminderTime: hReminder || null, paused, archived: true }),
      'Habit archived'
    ).catch(() => {});
    closeSheet();
  };

  const del = async () => {
    if (!editId) return;
    if (pending) {
      showToast('Still saving — try again in a moment');
      return;
    }
    if (!(await confirm({ title: 'Delete this habit?', message: 'It and all its check-ins will be removed.' }))) return;
    haptic();
    mutateOpt(
      (s) => ({
        ...s,
        habits: s.habits.filter((hb) => hb.id !== editId),
        checkins: s.checkins.filter((c) => c.habitId !== editId),
      }),
      () => api.deleteHabit(editId),
      'Habit deleted'
    ).catch(() => {});
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
        style={{ width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none', marginBottom: editId ? 22 : 14 }}
      />

      {!editId && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Suggestions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {HABIT_PRESETS.map((p) => (
              <div
                key={p.name}
                onClick={() => {
                  setName(p.name);
                  setColor(p.color);
                  setDays(p.days);
                }}
                className="pressRow"
                style={{ padding: '8px 13px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: `1.5px solid color-mix(in srgb,var(--${p.color}) 45%,var(--border))`, background: `color-mix(in srgb,var(--${p.color}) 10%,transparent)`, color: `var(--${p.color})` }}
              >
                {p.name}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>Color</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingLeft: 2 }}>
        {COLORS.map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: color === c ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }}
          />
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Days of the week</div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
        {DAY_LABELS.map((lbl, i) => {
          const on = days[i] === '1';
          return (
            <div
              key={i}
              onClick={() => toggleDay(i)}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all .15s',
                border: `1.5px solid ${on ? 'var(--teal)' : 'var(--border)'}`,
                background: on ? 'var(--teal)' : 'var(--surface)',
                color: on ? '#fff' : 'var(--text2)',
              }}
            >
              {lbl}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
        This habit only appears on the days you pick.
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Why this matters (optional)</div>
      <input
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="e.g. so I have energy for my kids"
        maxLength={200}
        style={{ width: '100%', height: 50, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 6 }}
      />
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>Shown when you're slipping, as a nudge.</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>Its own reminder</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>Leave empty to use the daily one</div>
        </div>
        <input
          type="time"
          value={hReminder}
          onChange={(e) => setHReminder(e.target.value)}
          style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', outline: 'none' }}
        />
      </div>

      {editId && (
        <div
          onClick={() => setPaused(!paused)}
          className="pressRow"
          role="button"
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: paused ? 'color-mix(in srgb,var(--warning) 12%,var(--surface))' : 'var(--bg)', border: `1px solid ${paused ? 'color-mix(in srgb,var(--warning) 35%,var(--border))' : 'var(--border)'}`, borderRadius: 14, padding: '12px 14px', marginBottom: 20, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 18 }} aria-hidden>{paused ? '⏸️' : '▶️'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{paused ? 'Paused' : 'Pause this habit'}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
              Travelling or unwell? Pausing hides it without breaking your run.
            </div>
          </div>
          <div style={toggleTrack(paused)}>
            <div style={toggleKnob(paused)} />
          </div>
        </div>
      )}

      <div
        onClick={save}
        style={{ background: canSave ? 'var(--teal)' : 'color-mix(in srgb,var(--teal) 40%,var(--surface))', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: canSave ? 'pointer' : 'default', marginTop: 8, transition: 'all .2s' }}
      >
        {editId ? 'Save changes' : 'Create habit'}
      </div>

      {editId && (
        <div
          onClick={archive}
          className="press99"
          role="button"
          style={{ height: 52, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', marginTop: 10 }}
        >
          Archive (keeps your history)
        </div>
      )}

      {editId && (
        <div onClick={del} className="press99" style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />
          Delete habit
        </div>
      )}
    </div>
  );
}
