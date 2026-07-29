import React from 'react';
import { useStore } from '../store';
import { IconWorkout, IconSleep, IconExpense, IconHabit } from '../icons';
import { enabled } from '../lib/modules';

export function Chooser() {
  const { open, go, closeSheet, state } = useStore();
  // Transactions deliberately go to the full add-transaction *screen* rather
  // than a cut-down sheet, so logging money is the same experience wherever it
  // starts from — keypad, categories, account, date, note and receipt.
  const addTxn = () => {
    closeSheet();
    go('faddtx');
  };
  const allItems = [
    { label: 'Workout', desc: 'Run, lift, walk…', key: 'coral', icon: <IconWorkout size={24} />, sheet: 'workout' as const },
    { label: 'Sleep', desc: 'Bedtime & wake-up', key: 'blue', icon: <IconSleep size={24} />, sheet: 'sleep' as const },
    { label: 'Expense', desc: 'Income or spend', key: 'emerald', icon: <IconExpense size={24} />, sheet: null, action: addTxn },
    { label: 'Habit', desc: 'Build a routine', key: 'teal', icon: <IconHabit size={24} />, sheet: 'habit' as const },
    {
      label: 'Counter',
      desc: 'Reps, pages, hours…',
      key: 'indigo',
      sheet: 'countpick' as const,
      icon: (
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M8 4l-1.2 16M15.2 4L14 20M5 9h14M4 15h14" />
        </svg>
      ),
    },
  ];
  // Only offer what the user chose to track.
  const modKey: Record<string, string> = { Workout: 'workouts', Sleep: 'sleep', Expense: 'finances', Habit: 'habits', Counter: 'counters' };
  const items = allItems.filter((it) => enabled(state!, modKey[it.label]));
  return (
    <div style={{ padding: '8px 20px 34px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 4px 16px' }}>Log something</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {items.map((it) => (
          <div
            key={it.label}
            onClick={() => (it.action ? it.action() : it.sheet && open(it.sheet))}
            className="press"
            style={{ background: `color-mix(in srgb,var(--${it.key}) 10%,var(--surface))`, border: `1px solid color-mix(in srgb,var(--${it.key}) 18%,var(--border))`, borderRadius: 20, padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <span style={{ width: 42, height: 42, borderRadius: 13, background: `color-mix(in srgb,var(--${it.key}) 16%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {it.icon}
            </span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{it.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{it.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
