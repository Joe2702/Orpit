import React from 'react';
import { useStore } from '../store';
import { IconWorkout, IconSleep, IconExpense, IconHabit } from '../icons';
import { enabled } from '../lib/modules';
import { t } from '../i18n';

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
    { label: t('Workout'), desc: t('A run, a lift, a match'), icon: <IconWorkout c="var(--text)" size={22} />, sheet: 'workout' as const },
    { label: t('Sleep'), desc: t('When you went to bed and woke up'), icon: <IconSleep c="var(--text)" size={22} />, sheet: 'sleep' as const },
    { label: t('Money'), desc: t('Something you spent or earned'), icon: <IconExpense c="var(--text)" size={22} />, sheet: null, action: addTxn },
    { label: t('Habit'), desc: t('Something to do regularly'), icon: <IconHabit c="var(--text)" size={22} />, sheet: 'habit' as const },
    {
      label: t('Counter'),
      desc: t('Reps, pages, glasses of water'),
      sheet: 'countpick' as const,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
          <path d="M8 4l-1.2 16M15.2 4L14 20M5 9h14M4 15h14" />
        </svg>
      ),
    },
  ];
  // Only offer what the user chose to track.
  const modKey: Record<string, string> = { Workout: 'workouts', Sleep: 'sleep', Money: 'finances', Habit: 'habits', Counter: 'counters' };
  const items = allItems.filter((it) => enabled(state!, modKey[it.label]));
  return (
    <div style={{ padding: '8px 20px 34px' }}>
      <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--text)', margin: '6px 2px 16px' }}>{t('Log something')}</div>
      {/* A list rather than a grid of tinted tiles: five rows are quicker to
          scan, and the choice is the label, not the colour. */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', overflow: 'hidden' }}>
        {items.map((it, i) => (
          <div tabIndex={0}
            key={it.label}
            onClick={() => (it.action ? it.action() : it.sheet && open(it.sheet))}
            className="pressRow"
            role="button"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--hairline)', cursor: 'pointer' }}
          >
            <span style={{ width: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{it.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{it.desc}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path className="flip-rtl" d="M7 4l5 5-5 5" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
