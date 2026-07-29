import React from 'react';
import { useStore } from '../store';
import { api, setToken } from '../api';
import { Avatar, SectionLabel, toggleTrack, toggleKnob } from '../ui';
import { IconChevron } from '../icons';
import { deviceTimezone } from '../lib/push';
import { enableReminders, disableReminders, updateReminderTime, sendTestNotification } from '../lib/notify';

export const MODULE_OPTS = [
  { key: 'habits', label: 'Habits', emoji: '🌱', color: 'teal' },
  { key: 'workouts', label: 'Workouts', emoji: '💪', color: 'coral' },
  { key: 'sleep', label: 'Sleep', emoji: '😴', color: 'blue' },
  { key: 'finances', label: 'Finances', emoji: '💰', color: 'emerald' },
  { key: 'counters', label: 'Counters', emoji: '🔢', color: 'indigo' },
];

export function Settings() {
  const { state, go, open, mutate, mutateOpt, signOut, showToast, haptic, confirm, applyState } = useStore();
  const profile = state!.profile;

  // Long-press (1.2s) on the version string opens the feedback inbox.
  const holdTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      haptic();
      go('feedbackInbox');
    }, 1200);
  };
  const cancelHold = () => clearTimeout(holdTimer.current);

  const dataTs = [...state!.workouts, ...state!.nights, ...state!.txns].map((x) => x.ts);
  const earliest = dataTs.length ? Math.min(...dataTs) : profile.createdAt;
  const daysTracked = Math.max(1, Math.round((Date.now() - earliest) / 86400000));
  const entries =
    state!.workouts.length +
    state!.nights.length +
    state!.txns.length +
    state!.habits.length +
    state!.countLogs.length;
  // Account age — time elapsed since the account was created, counting up.
  const ageDays = Math.max(0, Math.floor((Date.now() - profile.createdAt) / 86400000));
  const accountAge =
    ageDays < 1
      ? 'Today'
      : ageDays < 7
      ? `${ageDays}d`
      : ageDays < 30
      ? `${Math.floor(ageDays / 7)}w`
      : ageDays < 365
      ? `${Math.floor(ageDays / 30)}mo`
      : `${(ageDays / 365).toFixed(1)}y`;

  // Theme applies instantly (optimistic), then persists in the background.
  const setTheme = (val: 'light' | 'dark' | 'system') => {
    mutateOpt((s) => ({ ...s, profile: { ...s.profile, theme: val } }), () => api.updateMe({ theme: val }));
  };

  const toggle = (key: 'reminders' | 'haptics') => {
    const next = !profile[key];
    if (key === 'haptics' && next && 'vibrate' in navigator) navigator.vibrate(18);
    mutateOpt((s) => ({ ...s, profile: { ...s.profile, [key]: next } }), () => api.updateMe({ [key]: next }));
  };

  // Turning reminders on asks for notification permission and (native) schedules
  // the on-device daily reminder, or (web) subscribes to push.
  const toggleReminders = async () => {
    const next = !profile.reminders;
    if (next) {
      const time = profile.reminderTime || '21:00';
      await mutate(() => api.updateMe({ reminders: true, reminderTz: deviceTimezone(), reminderTime: time }));
      const st = await enableReminders(time);
      if (st === 'denied') showToast('Allow notifications in your phone settings');
      else if (st === 'ok') showToast('Daily reminder on 🌙');
      else if (st === 'unsupported') showToast('Reminders not supported on this device');
    } else {
      await disableReminders();
      mutate(() => api.updateMe({ reminders: false }));
    }
  };

  const setReminderTime = (t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return;
    mutate(() => api.updateMe({ reminderTime: t, reminderTz: deviceTimezone() }));
    updateReminderTime(t); // reschedule the native reminder to the new time
  };

  const sendTest = async () => {
    const r = await sendTestNotification();
    if (r === 'sent') showToast('Test sent 🎉 check your notifications');
    else if (r === 'denied') showToast('Allow notifications in your phone settings');
    else if (r === 'none') showToast('Turn on reminders first');
    else showToast('Could not send test');
  };

  // Wipe every entry (habits/workouts/sleep/finances/counters) after a
  // deliberate double confirmation — this can't be undone.
  const resetData = async () => {
    const ok = await confirm({
      title: 'Erase all your data?',
      message: 'Every workout, night, transaction, habit check-in and counter log will be deleted. This cannot be undone.',
      confirmLabel: 'Erase everything',
    });
    if (!ok) return;
    const sure = await confirm({
      title: 'Really sure?',
      message: 'Consider exporting your data first. There is no way back.',
      confirmLabel: 'Yes, erase it',
    });
    if (!sure) return;
    haptic();
    mutate(() => api.reset(), 'All data erased').catch(() => {});
  };

  // Permanently delete the account (app-store requirement, and the honest
  // counterpart to "your data is yours"). Two confirmations, then sign out.
  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message: 'Your account and everything in it will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    const sure = await confirm({
      title: 'This is permanent',
      message: 'Export your data first if you want to keep a copy. Continue?',
      confirmLabel: 'Delete forever',
    });
    if (!sure) return;
    try {
      await api.deleteMyAccount();
      showToast('Account deleted');
      signOut();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete the account');
    }
  };

  // Restore from a previously exported JSON file. Additive — never deletes.
  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const r = await api.importData(parsed);
        applyState(r.state);
        showToast(r.added ? `Imported ${r.added} items` : 'Nothing new to import');
      } catch (e) {
        showToast(e instanceof Error ? e.message : "That file couldn't be read");
      }
    };
    input.click();
  };

  const changePassword = async () => {
    const current = window.prompt('Current password (leave blank if you signed up with Google)') ?? null;
    if (current === null) return;
    const next = window.prompt('New password (at least 8 characters)') ?? null;
    if (next === null) return;
    try {
      await api.changePassword(current, next);
      showToast('Password changed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not change password');
    }
  };

  const signOutOthers = async () => {
    if (!(await confirm({
      title: 'Sign out other devices?',
      message: 'Every other phone or browser signed into this account will be logged out. This device stays signed in.',
      confirmLabel: 'Sign them out',
      danger: false,
    }))) return;
    try {
      const r = await api.signOutOthers();
      setToken(r.token);
      showToast('Other devices signed out');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not do that');
    }
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
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)', marginBottom: 18 }}>Profile</div>

      <div
        onClick={() => open('profile')}
        className="press99"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, cursor: 'pointer' }}
      >
        <Avatar name={profile.name} src={profile.avatar} size={54} />
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
          [accountAge, 'Account age'],
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

      {/* Unverified email. A nudge, never a wall — the account works either
          way; this only makes password recovery possible. */}
      {!profile.emailVerified && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'color-mix(in srgb,var(--warning) 10%,var(--surface))', border: '1px solid color-mix(in srgb,var(--warning) 32%,var(--border))', borderRadius: 18, padding: '15px 16px', marginBottom: 24 }}>
          <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 11, background: 'color-mix(in srgb,var(--warning) 18%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--warning)', strokeWidth: 1.9, strokeLinejoin: 'round' }} aria-hidden>
              <rect x="1.5" y="3.5" width="16" height="12" rx="2.5" />
              <path d="M2 5l7.5 5.5L17 5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>Confirm your email</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
              So you can reset your password if you ever lose it.
            </div>
          </div>
          <div
            onClick={async () => {
              haptic();
              try {
                const r = await api.sendVerifyEmail();
                showToast(r.already ? 'Already confirmed' : 'Link sent — check your inbox');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Could not send the link');
              }
            }}
            className="press92"
            role="button"
            style={{ flex: 'none', height: 38, padding: '0 15px', borderRadius: 999, background: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Send link
          </div>
        </div>
      )}

      <SectionLabel>Appearance</SectionLabel>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 3, marginBottom: 24 }}>
        {themeSeg.map(([label, val]) => {
          const active = (profile.theme || 'light') === val;
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

      <SectionLabel>What you track</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 8 }}>
        {MODULE_OPTS.map((m, i) => {
          const on = !profile.modules || profile.modules.includes(m.key);
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i === MODULE_OPTS.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: `color-mix(in srgb,var(--${m.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 17 }} aria-hidden>
                {m.emoji}
              </span>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
              <div
                onClick={() => {
                  const cur = profile.modules || MODULE_OPTS.map((x) => x.key);
                  const next = on ? cur.filter((k) => k !== m.key) : [...cur, m.key];
                  if (!next.length) {
                    showToast('Keep at least one');
                    return;
                  }
                  mutateOpt((st) => ({ ...st, profile: { ...st.profile, modules: next } }), () => api.updateMe({ modules: next }));
                }}
                role="switch"
                aria-checked={on}
                aria-label={m.label}
                style={toggleTrack(on)}
              >
                <div style={toggleKnob(on)} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 24, paddingLeft: 4, lineHeight: 1.5 }}>
        Hides what you don't use — nothing is deleted.
      </div>

      <SectionLabel>Accent colour</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingLeft: 2 }}>
        {['indigo', 'blue', 'teal', 'emerald', 'coral', 'purple', 'pink', 'amber', 'cyan', 'rose'].map((c) => {
          const active = (profile.accent || 'indigo') === c;
          return (
            <div
              key={c}
              onClick={() => mutateOpt((s) => ({ ...s, profile: { ...s.profile, accent: c } }), () => api.updateMe({ accent: c }))}
              role="button"
              aria-label={`Accent ${c}`}
              style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: active ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }}
            />
          );
        })}
      </div>

      <SectionLabel>Text size</SectionLabel>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 3, marginBottom: 24 }}>
        {([['Small', 0.9], ['Default', 1], ['Large', 1.1], ['Largest', 1.2]] as const).map(([lbl, v]) => {
          const active = Math.abs((profile.textScale || 1) - v) < 0.01;
          return (
            <div
              key={lbl}
              onClick={() => mutateOpt((st) => ({ ...st, profile: { ...st.profile, textScale: v } }), () => api.updateMe({ textScale: v }))}
              role="button"
              style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(active ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) }}
            >
              {lbl}
            </div>
          );
        })}
      </div>

      <SectionLabel>Preferences</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <PrefRow
          iconKey="indigo"
          title="Daily reminders"
          sub="A gentle nudge to log your day"
          on={profile.reminders}
          onToggle={toggleReminders}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M9.5 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L13.5 10V7a4 4 0 0 0-4-4ZM7.5 15a2 2 0 0 0 4 0" />
            </svg>
          }
          border
        />
        {profile.reminders && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <circle cx="9.5" cy="10" r="7" />
                <path d="M9.5 6v4l2.5 1.5" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Reminder time</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>End of day works best</div>
            </div>
            <input
              type="time"
              value={profile.reminderTime || '21:00'}
              onChange={(e) => setReminderTime(e.target.value)}
              style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        )}
        {profile.reminders && (
          <div onClick={sendTest} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 36, flex: 'none' }} />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--indigo)' }}>Send a test notification</div>
          </div>
        )}
        <PrefRow
          iconKey="blue"
          title="Wind-down nudge"
          sub="30 min before your usual bedtime"
          on={profile.windDown}
          onToggle={() =>
            mutateOpt(
              (st) => ({ ...st, profile: { ...st.profile, windDown: !profile.windDown } }),
              () => api.updateMe({ windDown: !profile.windDown })
            )
          }
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--blue)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M16 10.5A6.5 6.5 0 1 1 7.5 2a5 5 0 0 0 8.5 8.5Z" />
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
        <div onClick={exportData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
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
        <div onClick={importData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--teal) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M10 12V3M6.5 6.5L10 3l3.5 3.5M4 14v2h12v-2" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Import data</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Restore from an exported file</div>
          </div>
          <IconChevron />
        </div>
        <div onClick={resetData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--danger) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--danger)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.7 10h5.6l.7-10" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>Reset all data</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Erase every entry and start fresh</div>
          </div>
        </div>
      </div>

      <SectionLabel>Security</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <div onClick={changePassword} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <rect x="4" y="8.5" width="12" height="8" rx="2" />
              <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Change password</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Without the email round-trip</div>
          </div>
          <IconChevron />
        </div>
        <div onClick={signOutOthers} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--coral) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--coral)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <rect x="3" y="4" width="9" height="12" rx="2" />
              <path d="M14 7l3 3-3 3M17 10h-5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Sign out other devices</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Keeps you signed in here</div>
          </div>
          <IconChevron />
        </div>
      </div>

      <SectionLabel>Support</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <div onClick={() => go('privacy')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--blue) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--blue)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M10 2.5l6 2.5v5c0 3.4-2.5 6.4-6 7.5-3.5-1.1-6-4.1-6-7.5V5l6-2.5Z" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Privacy</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>What Orbit stores, and what it doesn't</div>
          </div>
          <IconChevron />
        </div>
        <div onClick={() => open('feedback')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,var(--indigo) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M4 4h12v9H8l-4 3.5V4Z" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Send feedback</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>Ideas, bugs, or suggestions</div>
          </div>
          <IconChevron />
        </div>
      </div>

      <div
        onClick={deleteAccount}
        className="press99"
        role="button"
        style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginBottom: 10 }}
      >
        Delete my account
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
      {/* Long-press the version to reach the (password-protected) feedback inbox. */}
      <div
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', marginTop: 18, fontFamily: "'Geist Mono',monospace", userSelect: 'none', cursor: 'default' }}
      >
        Orbit · build {__BUILD_ID__} · {__BUILT_AT__}
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
