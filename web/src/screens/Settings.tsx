import React from 'react';
import { useStore } from '../store';
import { api, setToken } from '../api';
import { CURRENCIES, ago } from '../lib/format';
import { useStartBankTracking } from '../lib/bankTracking';
import { setUsageSharing } from '../lib/usage';
import { lockAvailable, lockEnabled, setLockEnabled, unlock } from '../lib/appLock';
import { computeBadges } from '../lib/badges';
import { Avatar, SectionLabel, toggleTrack, toggleKnob, chip } from '../ui';
import { IconChevron } from '../icons';
import { deviceTimezone } from '../lib/push';
import { enableReminders, disableReminders, updateReminderTime, sendTestNotification, diagnose, requestExactAlarms, isNative, notificationsAllowed, ensureNotificationPermission, type NotifyDiagnostics } from '../lib/notify';
import { Glyph } from '../lib/appIcons';
import {
  smsSupported,
  smsEnabled,
  smsStatus,
  disableSms,
  rewindSms,
  syncSms,
  smsDiag,
  type SmsDiag,
  type SmsDiagEntry,
} from '../lib/smsSync';
import { getDigits, getLang, langPref, setDigits, setLangPref, t, tk, tn } from '../i18n';

export const MODULE_OPTS = [
  { key: 'habits', label: t('Habits'), icon: 'sprout' as const, color: 'teal' },
  { key: 'workouts', label: t('Workouts'), icon: 'dumbbell' as const, color: 'coral' },
  { key: 'sleep', label: t('Sleep'), icon: 'bed' as const, color: 'blue' },
  { key: 'finances', label: t('Finances'), icon: 'wallet' as const, color: 'emerald' },
  { key: 'counters', label: t('Counters'), icon: 'tally' as const, color: 'indigo' },
];


const ACCENT_NAME: Record<string, string> = { indigo: tk('indigo'), text: tk('graphite'), blue: tk('blue'), teal: tk('teal'), emerald: tk('emerald'), rose: tk('rose') };
export function Settings() {
  const { state, go, open, mutate, mutateOpt, signOut, showToast, haptic, confirm, askPassword, applyState, claimedBadges } = useStore();
  const badgeInfo = React.useMemo(() => {
    const all = computeBadges(state!);
    const earned = all.filter((b) => b.unlocked);
    return { total: all.length, earned: earned.length, toReveal: earned.filter((b) => !claimedBadges.includes(b.id)).length };
  }, [state, claimedBadges]);
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

  // The earliest entry may predate the state window, so prefer the archive's
  // all-time minimum and fall back to what's loaded.
  const dataTs = [...state!.workouts, ...state!.nights, ...state!.txns].map((x) => x.ts);
  const windowEarliest = dataTs.length ? Math.min(...dataTs) : profile.createdAt;
  const earliest = state!.archive?.earliestTs ?? windowEarliest;
  const daysTracked = Math.max(1, Math.round((Date.now() - earliest) / 86400000));
  const a = state!.archive;
  const entries =
    state!.workouts.length +
    state!.nights.length +
    state!.txns.length +
    state!.habits.length +
    state!.countLogs.length +
    (a ? a.workouts + a.nights + a.txns + a.countLogs : 0);
  // Account age — time elapsed since the account was created, counting up.
  const ageDays = Math.max(0, Math.floor((Date.now() - profile.createdAt) / 86400000));
  const accountAge =
    ageDays < 1
      ? t('Today')
      : ageDays < 7
      ? t('{n}d', { n: ageDays })
      : ageDays < 30
      ? t('{n}w', { n: Math.floor(ageDays / 7) })
      : ageDays < 365
      ? t('{n}mo', { n: Math.floor(ageDays / 30) })
      : t('{n}y', { n: Number((ageDays / 365).toFixed(1)) });

  // Theme applies instantly (optimistic), then persists in the background.
  const setTheme = (val: 'light' | 'dark' | 'system') => {
    mutateOpt((s) => ({ ...s, profile: { ...s.profile, theme: val } }), () => api.updateMe({ theme: val }));
  };

  // ---- Bank messages ----
  // Whether the phone has been given permission to read its inbox is per-device
  // by nature: a second phone has its own messages and its own permission.
  const [smsOn, setSmsOn] = React.useState(smsEnabled());
  const startTracking = useStartBankTracking();
  const linkedCount = (state?.accounts || []).filter((a) => (a.smsLinks || []).length).length;
  // Payment alerts need notification permission of their own; someone who
  // turned reminders down would otherwise never see one, and never know why.
  const [alertsOk, setAlertsOk] = React.useState(true);
  React.useEffect(() => {
    if (smsOn) notificationsAllowed().then(setAlertsOk);
  }, [smsOn]);
  const [scanning, setScanning] = React.useState(false);

  const [smsInfo, setSmsInfo] = React.useState<SmsDiag | null>(smsDiag());
  const [diagOpenSms, setDiagOpenSms] = React.useState(false);

  // A bank whose messages Orbit can't read gets fixed by seeing the format.
  // Only ever by choice, one message at a time, and only after showing the
  // user exactly what will be sent: digits and names masked out.
  const [sharedFormats, setSharedFormats] = React.useState<string[]>([]);
  const shareFormat = async (r: SmsDiagEntry) => {
    if (!r.masked || sharedFormats.includes(r.masked)) return;
    const ok = await confirm({
      title: t('Send this format?'),
      message: t('This is exactly what will be sent, with numbers and names hidden, so Orbit can learn to read {sender}:\n\n{masked}', { sender: r.sender, masked: r.masked }),
      confirmLabel: t('Send'),
    });
    if (!ok) return;
    try {
      await api.shareSmsFormat({ sender: r.sender, text: r.masked, reason: r.reason || '' });
      setSharedFormats((x) => [...x, r.masked!]);
      showToast(t('Sent, thank you'));
    } catch {
      showToast(t('Could not send it. Try again later.'));
    }
  };

  const scanMessages = async (announceNothing: boolean) => {
    if (!state) return;
    setScanning(true);
    const r = await syncSms(state, (items) => api.importSms(items), (base) => api.fx(base));
    setScanning(false);
    setSmsInfo(smsDiag());
    if (r.state) applyState(r.state);
    if (r.added > 0) {
      showToast(tn(r.added, '{n} payment added', '{n} payments added'));
    } else if (announceNothing) {
      // "Nothing found" is a real answer and a useful one — silence after a
      // deliberate tap reads as a broken button.
      showToast(r.read > 0 ? t('Already up to date') : t('No new bank messages found'));
    }
  };

  const toggleSms = async () => {
    if (smsOn) {
      disableSms();
      setSmsOn(false);
      showToast(t('Bank messages off'));
      return;
    }
    // The same flow as onboarding and Finances: disclosure, permission, first
    // scan, and a sheet with what it found.
    if (await startTracking()) {
      setSmsOn(true);
      setSmsInfo(smsDiag());
    }
  };

  const importOlder = async () => {
    const ok = await confirm({
      title: t('Import older messages?'),
      message:
        t('Orbit will look back a year for bank messages it has not read yet. Payments already imported will not be added twice.'),
      confirmLabel: t('Import'),
    });
    if (!ok) return;
    rewindSms(365);
    scanMessages(true);
  };

  // The permission can be taken away from outside the app, in Android's own
  // settings, and nothing tells us when that happens. Re-checking on open is
  // what stops the switch from claiming to be on while nothing is being read.
  React.useEffect(() => {
    if (!smsOn) return;
    smsStatus().then((st) => {
      if (!st.granted) {
        disableSms();
        setSmsOn(false);
      }
    });
  }, [smsOn]);

  // A one-line summary on the row. Fetched rather than derived: none of this is
  // part of the app state, because it is another person's information and must
  // never come out of the offline cache.
  const [partnerHint, setPartnerHint] = React.useState(t('Someone to keep you honest'));
  const [partnerUnread, setPartnerUnread] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    api
      .partner()
      .then((r) => {
        if (!alive) return;
        setPartnerUnread(r.partner?.unread || 0);
        setPartnerHint(
          r.partner
            ? t('Partnered with {name}', { name: r.partner.name.split(' ')[0] })
            : r.queued
              ? t('Looking for a match…')
              : r.eligible
                ? t('Not matched yet')
                : t('For members aged 18 and over')
        );
      })
      .catch(() => {
        /* offline or asleep: the row still opens, and the screen says why */
      });
    return () => {
      alive = false;
    };
  }, []);

  // App lock, offered only on a phone with a screen lock to ask for. Turning it
  // on asks once first, so it's known to work before it can lock anyone out.
  const [lockOffer, setLockOffer] = React.useState(false);
  const [lockOn, setLockOn] = React.useState(lockEnabled());
  React.useEffect(() => {
    lockAvailable().then(setLockOffer);
  }, []);
  const toggleLock = async () => {
    if (lockOn) {
      setLockEnabled(false);
      setLockOn(false);
      showToast(t('App lock off'));
      return;
    }
    if (!(await unlock(t('Turn on app lock')))) return;
    setLockEnabled(true);
    setLockOn(true);
    showToast(t('Orbit will ask to unlock when it opens'));
  };

  // Usage counts are on unless turned off; turning them off also tells the
  // server to delete what it has.
  const toggleUsage = () => {
    const next = profile.shareUsage === false;
    setUsageSharing(next);
    mutateOpt((s) => ({ ...s, profile: { ...s.profile, shareUsage: next } }), () => api.updateMe({ shareUsage: next }));
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
      if (st === 'denied') showToast(t('Allow notifications in your phone settings'));
      else if (st === 'ok') showToast(t('Daily reminder on'));
      else if (st === 'unsupported') showToast(t('Reminders not supported on this device'));
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

  // "Notifications don't work" has several distinct causes that look identical
  // from inside the app — permission revoked, notifications switched off in
  // system settings, exact alarms blocked so Doze defers everything, or nothing
  // scheduled on this device at all. Rather than guess, show what the OS
  // actually reports.
  //
  // This runs on its own rather than waiting to be asked. Someone whose exact
  // alarms were revoked by a system update has no symptom to notice — reminders
  // just quietly stop — and would never think to go looking for a diagnostics
  // screen. So the app checks, and stays quiet unless there's something to say.
  const [diag, setDiag] = React.useState<NotifyDiagnostics | null>(null);
  const [diagBusy, setDiagBusy] = React.useState(false);
  const [diagOpen, setDiagOpen] = React.useState(false);
  const runDiagnostics = async (silent = false) => {
    if (!silent) setDiagBusy(true);
    try {
      setDiag(await diagnose());
    } finally {
      if (!silent) setDiagBusy(false);
    }
  };

  const remindersOn = profile.reminders;
  React.useEffect(() => {
    if (!isNative() || !remindersOn) {
      setDiag(null);
      setDiagOpen(false);
      return;
    }
    runDiagnostics(true);
  }, [remindersOn]);

  // Green means every check the platform can answer came back fine. `null` is a
  // platform that doesn't expose the setting (exact alarms before Android 12),
  // which is not a problem — only an explicit `false` is.
  const diagHealthy =
    !!diag && diag.permission === 'granted' && diag.enabled !== false && diag.exact !== false && diag.scheduled > 0;
  // Healthy stays collapsed to one line; a problem opens itself.
  const diagShown = !!diag && (diagOpen || !diagHealthy);

  const sendTest = async () => {
    const r = await sendTestNotification();
    if (r === 'sent') showToast(t('Test sent. Check your notifications.'));
    else if (r === 'denied') showToast(t('Allow notifications in your phone settings'));
    else if (r === 'none') showToast(t('Turn on reminders first'));
    else showToast(t('Could not send test'));
  };

  // Wipe every entry (habits/workouts/sleep/finances/counters) after a
  // deliberate double confirmation — this can't be undone.
  const resetData = async () => {
    const ok = await confirm({
      title: t('Erase all your data?'),
      message: t('Every workout, night, transaction, habit check-in and counter log will be deleted. This cannot be undone.'),
      confirmLabel: t('Erase everything'),
    });
    if (!ok) return;
    const sure = await confirm({
      title: t('Really sure?'),
      message: t('Consider exporting your data first. There is no way back.'),
      confirmLabel: t('Yes, erase it'),
    });
    if (!sure) return;
    haptic();
    mutate(() => api.reset(), t('All data erased')).catch(() => {});
  };

  // Permanently delete the account (app-store requirement, and the honest
  // counterpart to "your data is yours"). Two confirmations, then sign out.
  const deleteAccount = async () => {
    const ok = await confirm({
      title: t('Delete your account?'),
      message: t('Your account and everything in it will be permanently removed. This cannot be undone.'),
      confirmLabel: t('Delete account'),
    });
    if (!ok) return;
    const sure = await confirm({
      title: t('This is permanent'),
      message: t('Export your data first if you want to keep a copy. Continue?'),
      confirmLabel: t('Delete forever'),
    });
    if (!sure) return;
    // Final gate: prove it's really you. A phone left unlocked on a table
    // shouldn't be two taps away from erasing the account.
    const password = await askPassword({
      title: t('Enter your password'),
      message: t('Confirm your password to permanently delete this account.'),
      confirmLabel: t('Delete account'),
    });
    if (!password) return;
    try {
      await api.deleteMyAccount(password);
      showToast(t('Account deleted'));
      signOut();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Could not delete the account'));
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
        showToast(r.added ? t('Imported {added} items', { added: r.added }) : t('Nothing new to import'));
      } catch (e) {
        showToast(e instanceof Error ? e.message : t('That file couldn\'t be read'));
      }
    };
    input.click();
  };

  const changePassword = async () => {
    const current = window.prompt(t('Current password (leave blank if you signed up with Google)')) ?? null;
    if (current === null) return;
    const next = window.prompt(t('New password (at least 8 characters)')) ?? null;
    if (next === null) return;
    try {
      await api.changePassword(current, next);
      showToast(t('Password changed'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Could not change password'));
    }
  };

  const signOutOthers = async () => {
    if (!(await confirm({
      title: t('Sign out other devices?'),
      message: t('Every other phone or browser signed into this account will be logged out. This device stays signed in.'),
      confirmLabel: t('Sign them out'),
      danger: false,
    }))) return;
    try {
      const r = await api.signOutOthers();
      setToken(r.token);
      showToast(t('Other devices signed out'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('That didn’t go through. Try again.'));
    }
  };

  const exportData = async () => {
    try {
      // Fetched from the server rather than assembled from state: the client
      // only holds a rolling window, so building the file locally would quietly
      // drop everything older.
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orbit-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(t('Data exported'));
    } catch {
      showToast(t('Export unavailable here'));
    }
  };

  // A row of choices with the chosen one raised. Changing the language or the
  // digits reloads Orbit once, so every date and label comes back in it.
  const segmented = (items: [string, boolean, () => void][], marginBottom = 24, keepDigits = false) => (
    <div data-digits={keepDigits ? 'keep' : undefined} style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom }}>
      {items.map(([label, active, onClick]) => (
        <div
          role="button"
          tabIndex={0}
          aria-pressed={active}
          key={label}
          onClick={active ? undefined : onClick}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px 0',
            borderRadius: 'calc(11px * var(--sq))',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all .2s',
            ...(active ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }),
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );

  const themeSeg: [string, 'light' | 'dark' | 'system'][] = [
    [tk('Light'), 'light'],
    [tk('Dark'), 'dark'],
    [tk('System'), 'system'],
  ];

  const manageRow = (
    label: string,
    iconKey: string,
    icon: React.ReactNode,
    onClick: () => void,
    last = false
  ) => (
    <div role="button" tabIndex={0}
      onClick={onClick}
      className="pressRow"
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
    >
      <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      <IconChevron />
    </div>
  );

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div className="display" style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--text)', marginBottom: 18 }}>{t('Profile')}</div>

      <div role="button" tabIndex={0}
        onClick={() => open('profile')}
        className="press99"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, cursor: 'pointer' }}
      >
        <Avatar name={profile.name} src={profile.avatar} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{profile.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 1 }}>{profile.email}</div>
        </div>
        <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path className="flip-rtl" d="M8 4l5 6-5 6" />
        </svg>
      </div>

      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 24 }}>
        {[
          [String(daysTracked), t('Days tracked')],
          [String(entries), t('Entries')],
          [accountAge, t('Account age')],
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'color-mix(in srgb,var(--warning) 10%,var(--surface))', border: '1px solid color-mix(in srgb,var(--warning) 32%,var(--border))', borderRadius: 'calc(18px * var(--sq))', padding: '15px 16px', marginBottom: 24 }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--warning)', strokeWidth: 1.9, strokeLinejoin: 'round' }} aria-hidden>
              <rect x="1.5" y="3.5" width="16" height="12" rx="2.5" />
              <path d="M2 5l7.5 5.5L17 5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{t('Confirm your email')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
              {t('So you can reset your password if you ever lose it.')}
            </div>
          </div>
          <div tabIndex={0}
            onClick={async () => {
              haptic();
              try {
                const r = await api.sendVerifyEmail();
                showToast(r.already ? t('Already confirmed') : t('Link sent. Check your inbox.'));
              } catch (e) {
                showToast(e instanceof Error ? e.message : t('Could not send the link'));
              }
            }}
            className="press92"
            role="button"
            style={{ flex: 'none', height: 38, padding: '0 15px', borderRadius: 999, background: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('Send link')}
          </div>
        </div>
      )}

      <SectionLabel>{t('Appearance')}</SectionLabel>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 24 }}>
        {themeSeg.map(([label, val]) => {
          const active = (profile.theme || 'light') === val;
          return (
            <div role="button" tabIndex={0}
              key={val}
              onClick={() => setTheme(val)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '9px 0',
                borderRadius: 'calc(11px * var(--sq))',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .2s',
                ...(active
                  ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' }
                  : { color: 'var(--text2)' }),
              }}
            >
              {t(label)}
            </div>
          );
        })}
      </div>

      <SectionLabel>{t('Language')}</SectionLabel>
      {segmented(
        [
          [t('Phone setting'), langPref() === 'auto', () => setLangPref('auto')],
          ['English', langPref() === 'en', () => setLangPref('en')],
          ['العربية', langPref() === 'ar', () => setLangPref('ar')],
        ],
        getLang() === 'ar' ? 14 : 24
      )}
      {getLang() === 'ar' && (
        <>
          <SectionLabel>{t('Numbers')}</SectionLabel>
          {segmented(
            [
              ['123', getDigits() === 'latn', () => setDigits('latn')],
              ['١٢٣', getDigits() === 'arab', () => setDigits('arab')],
            ],
            24,
            true
          )}
        </>
      )}

      <SectionLabel>{t('What you track')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 8 }}>
        {MODULE_OPTS.map((m, i) => {
          const on = !profile.modules || profile.modules.includes(m.key);
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i === MODULE_OPTS.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Glyph name={m.icon} size={19} color="var(--text2)" />
              </span>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
              <div tabIndex={0}
                onClick={() => {
                  const cur = profile.modules || MODULE_OPTS.map((x) => x.key);
                  const next = on ? cur.filter((k) => k !== m.key) : [...cur, m.key];
                  if (!next.length) {
                    showToast(t('You need at least one'));
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
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 24, paddingInlineStart: 4, lineHeight: 1.5 }}>
        {t('Hides what you don\'t use. Nothing is deleted.')}
      </div>

      <SectionLabel>{t('Accent colour')}</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingInlineStart: 2 }}>
        {['indigo', 'text', 'blue', 'teal', 'emerald', 'rose'].map((c) => {
          const active = (profile.accent || 'indigo') === c;
          return (
            <div tabIndex={0}
              key={c}
              onClick={() => mutateOpt((s) => ({ ...s, profile: { ...s.profile, accent: c } }), () => api.updateMe({ accent: c }))}
              role="button"
              aria-label={t('Accent colour: {name}', { name: t(ACCENT_NAME[c] ?? c) })}
              style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: active ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' }}
            />
          );
        })}
      </div>

      <SectionLabel>{t('Text size')}</SectionLabel>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 24 }}>
        {([[tk('Small'), 0.9], [tk('Default'), 1], [tk('Large'), 1.1], [tk('Largest'), 1.2]] as const).map(([lbl, v]) => {
          const active = Math.abs((profile.textScale || 1) - v) < 0.01;
          return (
            <div tabIndex={0}
              key={lbl}
              onClick={() => mutateOpt((st) => ({ ...st, profile: { ...st.profile, textScale: v } }), () => api.updateMe({ textScale: v }))}
              role="button"
              style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 'calc(11px * var(--sq))', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(active ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) }}
            >
              {t(lbl)}
            </div>
          );
        })}
      </div>

      {/* Currency is a setting, so it lives with the settings; it used to sit
          at the bottom of the Finances screen, under the transactions. */}
      <SectionLabel>{t('Currency')}</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {CURRENCIES.map((c) => {
          const active = (profile.currency || 'EGP') === c.code;
          return (
            <div tabIndex={0}
              key={c.code}
              onClick={() => mutateOpt((st) => ({ ...st, profile: { ...st.profile, currency: c.code } }), () => api.updateMe({ currency: c.code }))}
              role="button"
              aria-pressed={active}
              style={{ ...chip(active, 'var(--indigo)'), padding: '9px 14px' }}
            >
              {c.symbol.trim()} {c.code}
            </div>
          );
        })}
      </div>

      <SectionLabel>{t('Preferences')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <PrefRow
          iconKey="indigo"
          title={t('Daily reminders')}
          sub={t('One reminder a day to log')}
          on={profile.reminders}
          onToggle={toggleReminders}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M9.5 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L13.5 10V7a4 4 0 0 0-4-4ZM7.5 15a2 2 0 0 0 4 0" />
            </svg>
          }
          border
        />
        {profile.reminders && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <circle cx="9.5" cy="10" r="7" />
                <path d="M9.5 6v4l2.5 1.5" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Reminder time')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('End of day works best')}</div>
            </div>
            <input
              type="time"
              value={profile.reminderTime || '21:00'}
              onChange={(e) => setReminderTime(e.target.value)}
              style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(12px * var(--sq))', padding: '8px 12px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        )}
        {profile.reminders && (
          <div role="button" tabIndex={0} onClick={sendTest} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 36, flex: 'none' }} />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--indigo)' }}>{t('Send a test notification')}</div>
          </div>
        )}
        {isNative() && (
          <div role="button" tabIndex={0}
            onClick={() => (diag ? setDiagOpen((v) => !v) : runDiagnostics())}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: diagShown ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
          >
            <span style={{ width: 36, flex: 'none', display: 'flex', justifyContent: 'center' }}>
              {diag && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: diagHealthy ? 'var(--success)' : 'var(--danger)' }} />
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: diag && !diagHealthy ? 'var(--danger)' : 'var(--text2)' }}>
                {diagBusy
                  ? t('Checking…')
                  : !diag
                    ? t('Check reminder setup')
                    : diagHealthy
                      ? t('Reminders are set up correctly')
                      : t('Reminders may not arrive')}
              </div>
              {/* When everything is fine, the next scheduled time is the one
                  piece of proof worth showing — it answers the question the
                  panel used to exist for, in one line. */}
              {diag && diagHealthy && diag.nextAt && !diagOpen && (
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Next: {nextAt}', { nextAt: diag.nextAt })}</div>
              )}
              {diag && !diagHealthy && !diagOpen && (
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Tap to see what needs fixing')}</div>
              )}
            </div>
          </div>
        )}
        {diag && (diagOpen || !diagHealthy) && (
          <div style={{ padding: '14px 16px', background: 'var(--bg)' }}>
            {[
              [t('Permission to notify'), diag.permission === 'granted', diag.permission],
              [t('Enabled in system settings'), diag.enabled !== false, diag.enabled === null ? t('unknown') : diag.enabled ? t('yes') : t('no')],
              [t('Exact alarms allowed'), diag.exact !== false, diag.exact === null ? t('unknown') : diag.exact ? t('yes') : t('no')],
              [t('Reminders scheduled'), diag.scheduled > 0, String(diag.scheduled)],
            ].map(([label, ok, value]) => (
              <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: ok ? 'var(--success)' : 'var(--danger)' }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{label as string}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{value as string}</span>
              </div>
            ))}
            {diag.nextAt && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{t('Next reminder: {nextAt}', { nextAt: diag.nextAt })}</div>
            )}
            {diag.permission !== 'granted' && (
              <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 10, lineHeight: 1.5 }}>
                {t('Android is blocking notifications for Orbit. Open your phone\'s Settings → Apps → Orbit → Notifications and allow them, then check again.')}
              </div>
            )}
            {diag.permission === 'granted' && diag.exact === false && (
              <div tabIndex={0}
                onClick={async () => {
                  await requestExactAlarms();
                  runDiagnostics();
                }}
                className="press99"
                role="button"
                style={{ marginTop: 10, height: 44, borderRadius: 'calc(12px * var(--sq))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}
              >
                {t('Allow exact alarms so reminders arrive on time')}
              </div>
            )}
            {diag.permission === 'granted' && diag.enabled !== false && diag.scheduled === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--warning)', marginTop: 10, lineHeight: 1.5 }}>
                {t('Nothing is scheduled. Turn the daily reminder off and on again to re-schedule it.')}
              </div>
            )}
            <div tabIndex={0}
              onClick={() => runDiagnostics()}
              className="press99"
              role="button"
              style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}
            >
              {diagBusy ? t('Checking…') : t('Check again')}
            </div>
          </div>
        )}
        <PrefRow
          iconKey="indigo"
          title={t('Wind-down nudge')}
          sub={t('30 min before your usual bedtime')}
          on={profile.windDown}
          onToggle={() =>
            mutateOpt(
              (st) => ({ ...st, profile: { ...st.profile, windDown: !profile.windDown } }),
              () => api.updateMe({ windDown: !profile.windDown })
            )
          }
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M16 10.5A6.5 6.5 0 1 1 7.5 2a5 5 0 0 0 8.5 8.5Z" />
            </svg>
          }
          border
        />
        <PrefRow
          iconKey="indigo"
          title={t('Haptic feedback')}
          sub={t('Vibrate on actions')}
          on={profile.haptics}
          onToggle={() => toggle('haptics')}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M10 2v4M10 14v4M4 10h4M12 10h4" />
            </svg>
          }
        />
      </div>

      {smsSupported() && (
        <>
          <SectionLabel>{t('Bank messages')}</SectionLabel>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
            <PrefRow
              iconKey="indigo"
              title={t('Import from SMS')}
              sub={t('Bank alerts become transactions as they arrive')}
              on={smsOn}
              onToggle={toggleSms}
              icon={
                <svg width="19" height="19" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                  <path d="M3 5.5h14v9H7l-4 3v-12Z" />
                  <path d="M7 9.5h6M7 12h4" />
                </svg>
              }
              border={smsOn}
            />

            {smsOn && (
              <>
                {!alertsOk && (
                  <div tabIndex={0}
                    onClick={() => ensureNotificationPermission().then(setAlertsOk)}
                    className="pressRow"
                    role="button"
                    style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--indigo)' }}>{t('Allow payment alerts')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>
                      {t('Notifications are off, so a payment your bank tells you about while Orbit is closed won’t show up until you open it.')}
                    </div>
                  </div>
                )}

                {/* No account picker any more: each bank's messages go to that
                    bank's account, made the first time it is seen, so the
                    accounts in Finances are the user's real ones. */}
                <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                    {linkedCount ? tn(linkedCount, 'Tracking {n} account', 'Tracking {n} accounts') : t('Accounts are set up for you')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                    {t('Each bank, card and wallet gets its own account, with the balance your bank last reported. Transfers between them are counted once, not as spending.')}
                  </div>
                </div>

                <div role="button" tabIndex={0}
                  onClick={() => !scanning && scanMessages(true)}
                  className="pressRow"
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <span style={{ width: 36, flex: 'none' }} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--indigo)' }}>
                    {scanning ? t('Checking…') : t('Check for new messages now')}
                  </div>
                </div>

                <div role="button" tabIndex={0}
                  onClick={() => !scanning && importOlder()}
                  className="pressRow"
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <span style={{ width: 36, flex: 'none' }} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--indigo)' }}>{t('Import the past year')}</div>
                </div>

                {/* What the last scan actually saw. This is the difference between
                    "it doesn't work" and a fixable sentence: a native error, no
                    bank messages found, or bank messages that didn't read as
                    payments each look completely different here. */}
                <div role="button" tabIndex={0}
                  onClick={() => smsInfo && setDiagOpenSms((v) => !v)}
                  className={smsInfo ? 'pressRow' : undefined}
                  style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: smsInfo ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('Last check')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                      {smsInfo ? ago(smsInfo.at) : t('Not yet')}
                    </div>
                  </div>
                  {smsInfo && (
                    <div style={{ fontSize: 12, color: smsInfo.error ? 'var(--danger)' : 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
                      {smsInfo.error
                        ? smsInfo.error
                        : [
                            tn(smsInfo.scanned, '{n} message checked', '{n} messages checked'),
                            t('{n} from banks', { n: smsInfo.fromBanks }),
                            t('{n} read as payments', { n: smsInfo.parsed }),
                            t('{n} added', { n: smsInfo.added }),
                          ].join(' · ')}
                    </div>
                  )}
                  {smsInfo && !smsInfo.error && smsInfo.recent.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--indigo)', marginTop: 6 }}>
                      {diagOpenSms ? t('Hide recent bank messages') : t('Show recent bank messages')}
                    </div>
                  )}
                </div>
                {diagOpenSms && smsInfo && smsInfo.recent.length > 0 && (
                  <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                    {smsInfo.recent.map((r, i) => (
                      <div key={i} style={{ padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sender}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: r.ok ? 'var(--indigo)' : 'var(--text2)', flex: 'none' }}>{t(r.outcome)}</span>
                        </div>
                        <div dir="auto" style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                          {r.snippet}
                        </div>
                        {r.masked && (
                          <div tabIndex={0}
                            onClick={() => shareFormat(r)}
                            role="button"
                            style={{ fontSize: 12, fontWeight: 650, color: sharedFormats.includes(r.masked) ? 'var(--text3)' : 'var(--indigo)', marginTop: 5, cursor: 'pointer' }}
                          >
                            {sharedFormats.includes(r.masked) ? t('Sent, thank you') : t('Help Orbit read this bank')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Said plainly, and said here rather than buried in a policy page:
                this is the permission people are most right to be wary of. */}
            <div style={{ padding: '13px 16px', fontSize: 12, lineHeight: 1.55, color: 'var(--text2)' }}>
              {t(
                'Orbit reads only messages from banks and wallets, and only on this phone. The text of your messages is never sent anywhere: it stays on this phone so you can see what each entry was read from. Orbit works out the amount, the shop, the date and which bank on the device, and stores just those. Imported payments are marked SMS so you can check them, and you can edit or delete any of them like anything else.'
              )}
              {/* The keyless rate feeds ask for credit where their rates are used. */}
              <div style={{ marginTop: 8, color: 'var(--text3)' }}>
                {t('Foreign payments are converted with daily rates from')}{' '}
                <a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  currency-api
                </a>{' '}
                {t('and')}{' '}
                <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  Rates By Exchange Rate API
                </a>
                .
              </div>
            </div>
          </div>
        </>
      )}

      {/* Its own section rather than a row under Manage: it is the only part
          of the app that involves another person, and burying it among the
          tracker settings would understate what turning it on does. */}
      {/* Achievements live here now rather than as a trophy with a red dot in
          the Home header, where it asked for attention on every launch. */}
      <SectionLabel>{t('Progress')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <div tabIndex={0}
          onClick={() => go('achievements')}
          className="pressRow"
          role="button"
          style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' }}
        >
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Glyph name="trophy" size={19} color="var(--text2)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Achievements')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
              {t('{earned} of {total} earned', { earned: badgeInfo.earned, total: badgeInfo.total })}
              {badgeInfo.toReveal ? ' · ' + t('{n} to reveal', { n: badgeInfo.toReveal }) : ''}
            </div>
          </div>
          <IconChevron />
        </div>
        <div role="button" tabIndex={0}
          onClick={() => go('partner')}
          className="pressRow"
          style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}
        >
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <circle cx="7.2" cy="7" r="2.8" />
              <path d="M2.4 16a4.8 4.8 0 0 1 9.6 0" />
              <circle cx="14.5" cy="8.4" r="2.2" />
              <path d="M12.4 15.4a4 4 0 0 1 5.6-2.9" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Accountability partner')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
              {partnerHint}
            </div>
          </div>
          {partnerUnread > 0 && (
            <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 'calc(11px * var(--sq))', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginInlineEnd: 4 }}>
              {partnerUnread}
            </span>
          )}
          <IconChevron />
        </div>
      </div>

      <SectionLabel>{t('Manage')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        {manageRow(
          t('Counters'),
          'indigo',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M6 3l-.8 13M11 3l-.8 13M3 7h10M2.5 11h10" />
          </svg>,
          () => go('counters')
        )}
        {manageRow(
          t('Habits'),
          'teal',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <circle cx="9.5" cy="9.5" r="7.5" />
            <path d="M6.5 9.5l2 2 4-4" />
          </svg>,
          () => go('habits')
        )}
        {manageRow(
          t('Workout categories'),
          'coral',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M5 8v6M8 6v10M14 6v10M17 8v6M8 11h6" />
          </svg>,
          () => open('wcats')
        )}
        {manageRow(
          t('Finances'),
          'emerald',
          <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M3 6.5h13M3 10h13M6 14h7" />
          </svg>,
          () => go('finances'),
          true
        )}
      </div>

      <SectionLabel>{t('Data')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 14 }}>
        <PrefRow
          iconKey="indigo"
          title={t('Share usage counts')}
          sub={t('How often features are used, never what you enter')}
          on={profile.shareUsage !== false}
          onToggle={toggleUsage}
          icon={
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M4 16V9M10 16V4M16 16v-5" />
            </svg>
          }
          border
        />
        <div role="button" tabIndex={0} onClick={exportData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 14v2h12v-2" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Export data')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Download everything as JSON')}</div>
          </div>
          <IconChevron />
        </div>
        <div role="button" tabIndex={0} onClick={importData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M10 12V3M6.5 6.5L10 3l3.5 3.5M4 14v2h12v-2" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Import data')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Restore from an exported file')}</div>
          </div>
          <IconChevron />
        </div>
        <div role="button" tabIndex={0} onClick={resetData} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--danger)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.7 10h5.6l.7-10" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>{t('Reset all data')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Erase every entry and start fresh')}</div>
          </div>
        </div>
      </div>

      <SectionLabel>{t('Security')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        {lockOffer && (
          <PrefRow
            iconKey="indigo"
            title={t('App lock')}
            sub={t('Fingerprint, face or your phone\'s PIN to open Orbit')}
            on={lockOn}
            onToggle={toggleLock}
            icon={
              <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
                <path d="M5.5 9h9v7.5h-9zM7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" />
              </svg>
            }
            border
          />
        )}
        <div role="button" tabIndex={0} onClick={changePassword} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <rect x="4" y="8.5" width="12" height="8" rx="2" />
              <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Change password')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Without the email round-trip')}</div>
          </div>
          <IconChevron />
        </div>
        <div role="button" tabIndex={0} onClick={signOutOthers} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <rect x="3" y="4" width="9" height="12" rx="2" />
              <path d="M14 7l3 3-3 3M17 10h-5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Sign out other devices')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Keeps you signed in here')}</div>
          </div>
          <IconChevron />
        </div>
      </div>

      <SectionLabel>{t('Support')}</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', marginBottom: 24 }}>
        <div role="button" tabIndex={0} onClick={() => go('privacy')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
              <path d="M10 2.5l6 2.5v5c0 3.4-2.5 6.4-6 7.5-3.5-1.1-6-4.1-6-7.5V5l6-2.5Z" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Privacy')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('What Orbit stores, and what it doesn\'t')}</div>
          </div>
          <IconChevron />
        </div>
        <div role="button" tabIndex={0} onClick={() => open('feedback')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer' }}>
          <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M4 4h12v9H8l-4 3.5V4Z" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Send feedback')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t('Ideas, bugs, or suggestions')}</div>
          </div>
          <IconChevron />
        </div>
      </div>

      <div tabIndex={0}
        onClick={deleteAccount}
        className="press99"
        role="button"
        style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginBottom: 10 }}
      >
        {t('Delete my account')}
      </div>

      <div role="button" tabIndex={0}
        onClick={signOut}
        className="press99"
        style={{ height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}
      >
        <svg width="19" height="19" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M8 4H4v11h4M12 13l3-3.5L12 6M15 9.5H7" />
        </svg>
        {t('Sign out')}
      </div>
      {/* Long-press the version to reach the (password-protected) feedback inbox. */}
      <div
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', marginTop: 18, fontFamily: 'var(--font-mono)', userSelect: 'none', cursor: 'default' }}
      >
        {t('Orbit · build {v} · {v2}', { v: __BUILD_ID__, v2: __BUILT_AT__ })}
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
      <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{sub}</div>
      </div>
      <div role="switch" tabIndex={0} aria-checked={on} aria-label={title} onClick={onToggle} style={toggleTrack(on)}>
        <div style={toggleKnob(on)} />
      </div>
    </div>
  );
}
