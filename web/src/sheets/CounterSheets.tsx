import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { IconTrash } from '../icons';
import { CIcon, CTR_ICONS } from '../lib/iconPaths';
import { cNum, counterTotals } from '../lib/format';
import { COUNTER_PRESETS } from '../lib/presets';

const COLORS = ['indigo', 'coral', 'teal', 'blue', 'emerald', 'purple', 'pink', 'amber', 'cyan', 'rose'];
const UNITS = ['reps', 'pages', 'hours', 'min', 'km', 'cups'];
const STEPS = [1, 5, 10, 25];

// --- Create / edit a counter ---
export function CounterSheet() {
  const { sheetData, closeSheet, mutateOpt, haptic, confirm, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const pending = !!editId && editId.startsWith('tmp_');
  const [name, setName] = useState<string>(sheetData?.name ?? '');
  const [unit, setUnit] = useState<string>(sheetData?.unit ?? 'reps');
  const [color, setColor] = useState<string>(sheetData?.color ?? 'indigo');
  const [icon, setIcon] = useState<string>(sheetData?.icon ?? 'reps');
  const [step, setStep] = useState<number>(sheetData?.step ?? 5);
  const canSave = !!name.trim();

  // Apply the change to the UI immediately and close; the server call reconciles
  // in the background (rolls back on failure). Avoids the ~2s wait on the free host.
  const save = () => {
    if (!canSave) return;
    if (pending) {
      showToast('Still saving — try again in a moment');
      return;
    }
    haptic();
    const body = { name: name.trim(), unit: unit.trim() || 'count', color, icon, step };
    if (editId) {
      mutateOpt(
        (s) => ({ ...s, counters: s.counters.map((c) => (c.id === editId ? { ...c, ...body } : c)) }),
        () => api.editCounter(editId, body),
        'Counter updated'
      ).catch(() => {});
    } else {
      const tempId = 'tmp_' + Date.now();
      mutateOpt(
        (s) => ({ ...s, counters: [...s.counters, { id: tempId, ...body }] }),
        () => api.addCounter(body),
        'Counter created'
      ).catch(() => {});
    }
    closeSheet();
  };
  const del = async () => {
    if (!editId) return;
    if (pending) {
      showToast('Still saving — try again in a moment');
      return;
    }
    if (!(await confirm({ title: 'Delete this counter?', message: 'It and all its logs will be removed.' }))) return;
    haptic();
    mutateOpt(
      (s) => ({
        ...s,
        counters: s.counters.filter((c) => c.id !== editId),
        countLogs: s.countLogs.filter((l) => l.counterId !== editId),
      }),
      () => api.deleteCounter(editId),
      'Counter deleted'
    ).catch(() => {});
    closeSheet();
  };

  const input: React.CSSProperties = { width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none' };
  const label = (t: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>;

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>{editId ? 'Edit counter' : 'New counter'}</div>
      {label('Name')}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pull-ups" style={{ ...input, marginBottom: editId ? 20 : 14 }} />
      {!editId && (
        <>
          {label('Suggestions')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {COUNTER_PRESETS.map((p) => (
              <div
                key={p.name}
                onClick={() => {
                  setName(p.name);
                  setUnit(p.unit);
                  setIcon(p.icon);
                  setColor(p.color);
                  setStep(p.step);
                }}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: `1.5px solid color-mix(in srgb,var(--${p.color}) 45%,var(--border))`, background: `color-mix(in srgb,var(--${p.color}) 10%,transparent)`, color: `var(--${p.color})` }}
              >
                <CIcon icon={p.icon} color={`var(--${p.color})`} size={16} />
                {p.name}
              </div>
            ))}
          </div>
        </>
      )}
      {label('Unit')}
      <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. reps" style={{ ...input, marginBottom: 12 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {UNITS.map((u) => (
          <div key={u} onClick={() => setUnit(u)} style={chip(unit === u, 'var(--indigo)')}>{u}</div>
        ))}
      </div>
      {label('Quick-add step')}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {STEPS.map((n) => (
          <div key={n} onClick={() => setStep(n)} style={{ ...chip(step === n, 'var(--indigo)'), flex: 1, textAlign: 'center' }}>+{n}</div>
        ))}
      </div>
      {label('Color')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, paddingLeft: 2 }}>
        {COLORS.map((c) => (
          <div key={c} onClick={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: color === c ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }} />
        ))}
      </div>
      {label('Icon')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9, marginBottom: 24 }}>
        {CTR_ICONS.map((ic) => (
          <div key={ic} onClick={() => setIcon(ic)} style={{ height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${icon === ic ? `var(--${color})` : 'var(--border)'}`, background: icon === ic ? `color-mix(in srgb,var(--${color}) 12%,transparent)` : 'var(--bg)' }}>
            <CIcon icon={ic} color={icon === ic ? `var(--${color})` : 'var(--text2)'} size={22} />
          </div>
        ))}
      </div>
      <div onClick={save} style={{ background: canSave ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: canSave ? 'pointer' : 'default', marginTop: 8, transition: 'all .2s' }}>
        {editId ? 'Save changes' : 'Create counter'}
      </div>
      {editId && (
        <div onClick={del} className="press99" style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />Delete counter
        </div>
      )}
    </div>
  );
}

// --- Pick a counter to log ---
export function CountPickSheet() {
  const { state, open } = useStore();
  const logs = state!.countLogs;
  return (
    <div style={{ padding: '8px 20px 34px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 4px 16px' }}>Log a counter</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
        {state!.counters.map((c, i) => {
          const col = `var(--${c.color})`;
          const t = counterTotals(logs, c.id);
          return (
            <div key={c.id} onClick={() => open('countlog', { counterId: c.id, amount: c.step })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i === state!.counters.length - 1 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flex: 'none', background: `color-mix(in srgb,${col} 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CIcon icon={c.icon} color={col} size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{cNum(t.month)} {c.unit} this month</div>
              </div>
              <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><path d="M7 4l5 5-5 5" /></svg>
            </div>
          );
        })}
      </div>
      <div onClick={() => open('counter')} className="press99" style={{ height: 52, borderRadius: 16, border: '1.5px dashed color-mix(in srgb,var(--indigo) 40%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer', background: 'color-mix(in srgb,var(--indigo) 6%,transparent)' }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>New counter
      </div>
    </div>
  );
}

// --- Log an amount against a counter ---
export function CountLogSheet() {
  const { state, sheetData, closeSheet, mutateOpt, haptic, showToast } = useStore();
  const counter = state!.counters.find((c) => c.id === sheetData?.counterId);
  const step = counter?.step || 1;
  const col = `var(--${counter?.color || 'indigo'})`;
  const [amount, setAmount] = useState<number>(sheetData?.amount ?? step);
  // How much this counter has recorded in total — you can't remove more than
  // that, so the running total can never go negative.
  const runningTotal = state!.countLogs
    .filter((l) => l.counterId === counter?.id)
    .reduce((a, l) => a + l.amount, 0);
  const setClamped = (v: number) => setAmount(Math.max(-runningTotal, v));
  // Quick-add chips scale with the counter's own step instead of a fixed 1/5/10/25.
  const chips = Array.from(new Set([step, step * 2, step * 5, step * 10])).slice(0, 4);

  const save = () => {
    if (amount === 0) {
      showToast('Adjust the amount first');
      return;
    }
    haptic();
    const cid = counter!.id;
    const tempId = 'tmp_' + Date.now();
    const unit = counter?.unit || '';
    // Log instantly in the UI, sync in the background. A negative amount removes.
    mutateOpt(
      (s) => ({ ...s, countLogs: [...s.countLogs, { id: tempId, counterId: cid, amount, ts: Date.now() }] }),
      () => api.logCounter(cid, amount),
      amount > 0 ? `Logged ${cNum(amount)} ${unit}` : `Removed ${cNum(-amount)} ${unit}`
    ).catch(() => {});
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 22px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>Log {counter?.name || 'counter'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Today</div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-.03em', color: amount < 0 ? 'var(--danger)' : col, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{cNum(amount)}</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text2)', marginLeft: 8 }}>{counter?.unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, marginBottom: 20 }}>
        <div onClick={() => setClamped(amount - step)} className="press92" role="button" aria-label={`Decrease by ${step}`} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <svg width="22" height="22" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 2.4, strokeLinecap: 'round' }} aria-hidden><path d="M5 11h12" /></svg>
        </div>
        <div onClick={() => setClamped(amount + step)} className="press92" role="button" aria-label={`Increase by ${step}`} style={{ width: 52, height: 52, borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', boxShadow: '0 6px 12px -6px rgba(40,36,28,.22)' }}>
          <svg width="22" height="22" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }} aria-hidden><path d="M11 5v12M5 11h12" /></svg>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 8 }}>
        {chips.map((n) => (
          <div key={n} onClick={() => setClamped(amount + n)} className="pressRow" role="button" style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer' }}>+{cNum(n)}</div>
        ))}
      </div>
      {amount < 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          Removing {cNum(-amount)} of {cNum(runningTotal)} {counter?.unit} logged
        </div>
      )}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <span onClick={() => setAmount(0)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: 6 }}>Reset</span>
      </div>
      <div onClick={save} style={{ background: amount === 0 ? 'color-mix(in srgb,var(--indigo) 40%,var(--surface))' : amount < 0 ? 'var(--danger)' : col, color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: amount === 0 ? 'default' : 'pointer', marginTop: 6, transition: 'all .2s' }}>{amount < 0 ? 'Remove' : 'Save log'}</div>
    </div>
  );
}
