import React from 'react';
import { useStore } from '../store';
import { avatarInitial, BackButton } from '../ui';
import { IconWorkout, IconSleep, IconExpense, IconHabit, IconPlus } from '../icons';
import { todayStr } from '../lib/format';
import { t } from '../i18n';

export function HomeEmpty() {
  const { state, open } = useStore();
  const quick = [
    { label: t('Workout'), key: 'coral', icon: <IconWorkout />, sheet: 'workout' as const },
    { label: t('Sleep'), key: 'blue', icon: <IconSleep />, sheet: 'sleep' as const },
    { label: t('Expense'), key: 'emerald', icon: <IconExpense />, sheet: 'expense' as const },
    { label: t('Habit'), key: 'teal', icon: <IconHabit />, sheet: 'habit' as const },
  ];
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{todayStr()}</div>
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', marginTop: 3, color: 'var(--text)' }}>{t('Welcome to Orbit')}</div>
        </div>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', fontWeight: 700, fontSize: 17 }}>
          {avatarInitial(state!.profile.name)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '34px 10px 30px', gap: 16 }}>
        <div style={{ width: 104, height: 104, borderRadius: '50%', border: '2px dashed color-mix(in srgb,var(--indigo) 38%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb,var(--indigo) 7%,transparent)' }}>
          <svg width="44" height="44" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <ellipse cx="22" cy="22" rx="19" ry="8" transform="rotate(-28 22 22)" />
            <circle cx="22" cy="22" r="4.5" style={{ fill: 'var(--indigo)', stroke: 'none' }} />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{t('Your day starts here')}</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55, maxWidth: 264 }}>
            {t('Log something or add a habit, and this page fills in as you go.')}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>{t('Start tracking')}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {quick.map((it) => (
          <div role="button" tabIndex={0}
            key={it.label}
            onClick={() => open(it.sheet)}
            className="press96"
            style={{ flex: 1, background: `color-mix(in srgb,var(--${it.key}) 11%,var(--surface))`, border: `1px solid color-mix(in srgb,var(--${it.key}) 16%,var(--border))`, borderRadius: 'calc(18px * var(--sq))', padding: '14px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer' }}
          >
            {it.icon}
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailEmpty({
  title,
  colorKey,
  heading,
  body,
  cta,
  sheet,
  icon,
}: {
  title: string;
  colorKey: string;
  heading: string;
  body: string;
  cta: string;
  sheet: 'workout' | 'sleep' | 'expense' | 'habit';
  icon: React.ReactNode;
}) {
  const { go, open } = useStore();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('home')} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '56px 16px', gap: 18 }}>
        <div style={{ width: 104, height: 104, borderRadius: '50%', border: `2px dashed color-mix(in srgb,var(--${colorKey}) 38%,var(--border))`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,var(--${colorKey}) 7%,transparent)` }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{heading}</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55, maxWidth: 262 }}>{body}</div>
        </div>
        <div role="button" tabIndex={0}
          onClick={() => open(sheet)}
          className="press"
          style={{ background: `var(--${colorKey})`, color: 'var(--on-accent)', height: 52, padding: '0 26px', borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)' }}
        >
          <IconPlus />
          {cta}
        </div>
      </div>
    </div>
  );
}

export const WorkoutsEmpty = () => (
  <DetailEmpty
    title={t('Workouts')}
    colorKey="indigo"
    heading={t('No workouts yet')}
    body={t('Log your first session and your trends and breakdown will appear here.')}
    cta={t('Log a workout')}
    sheet="workout"
    icon={
      <svg width="42" height="42" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <path d="M9 14v14M15 11v20M27 11v20M33 14v14M15 21h12" />
      </svg>
    }
  />
);

export const HabitsEmpty = () => (
  <DetailEmpty
    title={t('Habits')}
    colorKey="indigo"
    heading={t('Build your first habit')}
    body={t('Pick something small and repeatable. Watch your streaks and heatmap grow.')}
    cta={t('Add a habit')}
    sheet="habit"
    icon={
      <svg width="42" height="42" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <circle cx="21" cy="21" r="16" />
        <path d="M14 21l5 5 9-10" />
      </svg>
    }
  />
);

export const SleepEmpty = () => (
  <DetailEmpty
    title={t('Sleep')}
    colorKey="indigo"
    heading={t('Track your first night')}
    body={t('Log how you slept to see duration, quality, and consistency over time.')}
    cta={t('Log sleep')}
    sheet="sleep"
    icon={
      <svg width="42" height="42" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <path d="M34 22.5A14 14 0 1 1 17.5 6a11 11 0 0 0 16.5 16.5Z" />
      </svg>
    }
  />
);

export const FinancesEmpty = () => (
  <DetailEmpty
    title={t('Finances')}
    colorKey="indigo"
    heading={t('No transactions yet')}
    body={t('Add income or an expense to see your balance, categories, and trends.')}
    cta={t('Add transaction')}
    sheet="expense"
    icon={
      <svg width="42" height="42" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <path d="M19 6v30M27 12H15.5a5 5 0 0 0 0 10h7a5 5 0 0 1 0 10H12" />
      </svg>
    }
  />
);
