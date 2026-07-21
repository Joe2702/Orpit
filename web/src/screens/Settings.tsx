import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { avatarInitial, SectionLabel, toggleTrack, toggleKnob } from '../ui';
import { IconChevron } from '../icons';

export function Settings() {
  const { state, go, open, mutate, signOut, showToast, haptic } = useStore();
  const profile = state!.profile;
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout>>();

  const dataTs = [...state!.workouts, ...state!.nights, ...state!.txns].map((x) => x.ts);
  const earliest = dataTs.length ? Math.min(...dataTs) : profile.createdAt;
  const daysTracked = Math.max(1, Math.round((Date.now() - earliest) / 86400000));
  const entries =
    state!.workouts.length +
    state!.nights.length +
    state!.txns.length +
    state!.habits.length +
    state!.countLogs.length;
  const memberSince = new Date(earliest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const setTheme = (val: 'light' | 'dark' | 'system') => {
    const resolved =
      val === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : val;
    mutate(() => api.updateMe({ theme: resolved }));
  };

  const toggle = (key: 'reminders' | 'haptics') => {
    const next = !profile[key];
    if (key === 'haptics' && next && 'vibrate' in navigator) navigator.vibrate(18);
    mutate(() => api.updateMe({ [key]: next }));
  };

  const exportData = () => {
    try {
      const data = {
        profile: { name: profile.name, email: profile.email },
        habits: state!.habits,
        checkins: state!.checkins,
        wCats: state!.wCats,
        workouts: state!.workouts,
        nights: state!.nights,
        txns: state!.txns,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orbit-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Data exported');
    } catch {
      showToast('Export unavailable here');
    }
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      showToast('Tap again to reset all data');
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmReset(false), 3200);
      return;
    }
    clearTimeout(resetTimer.current);
    setConfirmReset(false);
    mutate(() => api.reset(), 'All data reset');
  };

  const themeSeg: ['Light' | 'Dark' | 'System', 'light' | 'dark' | 'system'][] = [
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['System', 'system'],
  ];

  const manageRow = (
    label: string,
    iconKey: string,
    icon: React.ReactNode,
    onClick: () => void,
    last = false
  ) => (
    <div
      onClick={onClick}
      className="pressRow"
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb,var(--${iconKey}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      <IconChevron />
    </div>
  );

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)', marginBottom: 18 }}>Settings</div>

      <div
        onClick={() => open('profile')}
        className="press99"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, cursor: 'pointer' }}
      >
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flex: 'none' }}>
          {avatarInitial(profile.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{profile.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{profile.email}</div>
        </div>
        <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M8 4l5 6-5 6" />
        </svg>
      </div>

      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 24 }}>
        {[
          [String(daysTracked), 'Days tracked'],
          [String(entries), 'Entries'],
          [memberSince, 'Member since'],
        ].map(([v, l], i) => (
          <React.Fragment key={l}>
            {i > 0 && <div style={{ width: 1, background: 'var(--border)' }} />}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{v}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>{l}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 3, marginBottom: 24 }}>
        {themeSeg.map(([label, val]) => {
          const active = val === 'system' ? false : profile.theme === val;
          return (
            <div
              key={val}
              onClick={() => setTheme(val)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '9px 0',
                borderRadius: 11,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .2s',
                ...(active
                  ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' }
                  : { color: 'var(--text2)' }),
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <SectionLabel>Preferences</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <PrefRow
          iconKey="indigo"
          title="Daily reminders"
          sub="Nudge me to log each day"
          on={profile.reminders}
          onToggle={() => toggle('reminders')}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M9.5 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L13.5 10V7a4 4 0 0 0-4-4ZM7.5 15a2 2 0 0 0 4 0" />
            </svg>
          }
          border
        />
        <PrefRow
          iconKey="coral"
          title="Haptic feedback"
          sub="Vibrate on actions"
          on={profile.haptics}
          onToggle={() => toggle('haptics')}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M10 2v4M10 14v4M4 10h4M12 10h4" />
            </svg>
          }
        />
      </div>

      <SectionLabel>Manage</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        {manageRow(
          'Counters',
          'indigo',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M6 3l-.8 13M11 3l-.8 13M3 7h10M2.5 11h10" />
          </svg>,
          () => go('counters')
        )}
        {manageRow(
          'Habits',
          'teal',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <circle cx="9.5" cy="9.5" r="7.5" />
            <path d="M6.5 9.5l2 2 4-4" />
          </svg>,
          () => go('habits')
        )}
        {manageRow(
          'Workout categories',
          'coral',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M5 8v6M8 6v10M14 6v10M17 8v6M8 11h6" />
          </svg>,
          () => open('wcats')
        )}
        {manageRow(
          'Finances',
          'emerald',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--emerald)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M3 6.5h13M3 10h13M6 14h7" />
          </svg>,
          () => go('finances'),
          true
        )}
      </div>

      <SectionLabel>Data</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 14 }}>
        <div onClick={exportData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--blue) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--blue)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 14v2h12v-2" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Export data</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Download everything as JSON</div>
          </div>
          <IconChevron />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Preview empty states</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>See first-run screens with no data</div>
          </div>
          <EmptyToggle />
        </div>
      </div>

      <div
        onClick={reset}
        className="press99"
        style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginBottom: 14 }}
      >
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--danger)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
        </svg>
        {confirmReset ? 'Tap again to confirm reset' : 'Reset all data'}
      </div>

      <div
        onClick={signOut}
        className="press99"
        style={{ height: 52, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}
      >
        <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M8 4H4v11h4M12 13l3-3.5L12 6M15 9.5H7" />
        </svg>
        Sign out
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', marginTop: 18, fontFamily: "'Geist Mono',monospace" }}>
        Orbit v1.0.0 · made with care
      </div>
    </div>
  );
}

function PrefRow({
  iconKey,
  title,
  sub,
  on,
  onToggle,
  icon,
  border,
}: {
  iconKey: string;
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: border ? '1px solid var(--border)' : 'none' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb,var(--${iconKey}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{sub}</div>
      </div>
      <div onClick={onToggle} style={toggleTrack(on)}>
        <div style={toggleKnob(on)} />
      </div>
    </div>
  );
}

function EmptyToggle() {
  const { emptyMode, setEmptyMode } = useStore();
  return (
    <div onClick={() => setEmptyMode(!emptyMode)} style={toggleTrack(emptyMode)}>
      <div style={toggleKnob(emptyMode)} />
    </div>
  );
}
