import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { ago, dayKey } from '../lib/format';
import { connectHealth, healthAvailable, healthGranted, healthPrefs, openHealthSettings, setHealthPrefs, syncHealth, type HealthGrant } from '../lib/health';
import { STEP_GOAL, backgroundStatus, configureStepAlerts, requestBackground, stepPrefs, stepsHabit, stepsOn, syncSteps } from '../lib/steps';
import { num, t, tn } from '../i18n';

const btn = (primary: boolean): React.CSSProperties => ({
  height: 52,
  borderRadius: 'calc(16px * var(--sq))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  background: primary ? 'var(--indigo)' : 'var(--surface)',
  color: primary ? 'var(--on-accent)' : 'var(--text)',
  border: primary ? 'none' : '1px solid var(--border)',
  marginTop: 8,
});

// Apps that save to Health Connect, by the names people know them by.
const APPS = ['Samsung Health', 'Google Fit', 'Fitbit', 'Garmin Connect', 'Mi Fitness', 'Huawei Health', 'Strava'];

/**
 * The person's health app, by way of Health Connect: steps for the Steps
 * habit, and sleep and workouts saved as Orpit entries. What it does, how to
 * turn it on, and once it's on, what came in and when.
 */
export function HealthSheet() {
  const { state, applyState, showToast, haptic } = useStore();
  const [prefs, setPrefs] = useState(healthPrefs);
  const [avail, setAvail] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [granted, setGranted] = useState<HealthGrant | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    healthAvailable().then((a) => {
      setAvail(a);
      if (a.ok) healthGranted().then(setGranted);
    });
  }, []);

  const s = state!;
  const imported = {
    nights: s.nights.filter((n) => n.source).length,
    workouts: s.workouts.filter((w) => w.source).length,
  };
  const today = stepsOn(s, dayKey());
  const habit = stepsHabit(s);

  const sync = async (quiet = false) => {
    setBusy(true);
    try {
      const st = await syncSteps().catch(() => null);
      if (st) applyState(st.state);
      const r = await syncHealth(st?.state ?? s);
      if (r) {
        applyState(r.state);
        setPrefs(healthPrefs());
        if (!quiet || r.nights || r.workouts) {
          showToast(
            r.nights || r.workouts
              ? t('Imported {what}', { what: [r.nights ? tn(r.nights, 'one night', '{n} nights') : '', r.workouts ? tn(r.workouts, 'one workout', '{n} workouts') : ''].filter(Boolean).join(' · ') })
              : t('Up to date')
          );
        }
      }
    } catch {
      showToast(t('Couldn’t sync just now. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    haptic();
    setBusy(true);
    let g: HealthGrant;
    try {
      g = await connectHealth();
      setGranted(g);
      if (!g.steps && !g.sleep && !g.workouts) {
        showToast(t('Allow Steps, Sleep and Exercise to bring them in'));
        return;
      }
      const next = { on: true, lastSync: null };
      setHealthPrefs(next);
      setPrefs(next);
    } catch {
      showToast(t('Couldn’t open Health Connect'));
      return;
    } finally {
      setBusy(false);
    }
    await sync(false);
    configureStepAlerts(s);
    // Step notifications need to read steps while Orpit is closed; where the
    // phone supports it, that's one more yes, asked now while it makes sense.
    if (g.steps && stepPrefs().notify) {
      const bg = await backgroundStatus();
      if (bg.available && !bg.granted) await requestBackground();
    }
  };

  const disconnect = () => {
    haptic();
    const next = { on: false, lastSync: prefs.lastSync };
    setHealthPrefs(next);
    setPrefs(next);
    configureStepAlerts(s);
    showToast(t('Stopped syncing'));
  };

  const addStepsHabit = () => {
    haptic();
    api
      .addHabit({ name: 'Steps', color: 'emerald', target: 'Daily', days: '1111111', auto: 'steps', goal: STEP_GOAL })
      .then((st) => {
        applyState(st);
        showToast(t('Steps is back in your habits'));
      })
      .catch(() => showToast(t('That didn’t work. Try again in a moment.')));
  };

  const P = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>{children}</div>;
  const step = (n: number, text: string) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', flex: 'none', background: 'color-mix(in srgb, var(--indigo) 15%, transparent)', color: 'var(--indigo)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
  const missing = granted ? [!granted.steps && t('Steps'), !granted.sleep && t('Sleep'), !granted.workouts && t('Exercise')].filter(Boolean) : [];
  const none = granted && !granted.steps && !granted.sleep && !granted.workouts;

  return (
    <div style={{ padding: '8px 20px 32px' }}>
      <div className="display" style={{ fontSize: 28, lineHeight: 1.1, color: 'var(--text)', margin: '8px 2px 12px' }}>{t('Your health app')}</div>
      <P>{t('Your health app saves your steps, sleep and workouts to Health Connect on this phone. Orpit reads them from there: steps tick your Steps habit, and nights and workouts come in without logging them twice. Orpit only reads; it changes nothing in your apps.')}</P>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {APPS.map((a) => (
          <span key={a} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', padding: '4px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {a}
          </span>
        ))}
      </div>

      {avail && !avail.ok && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '16px 16px', marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Health Connect isn’t ready on this phone')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>{t('It’s built into Android 14 and later. On older phones, install or update it from the Play Store, then come back.')}</div>
          </div>
          <div role="button" tabIndex={0} onClick={() => openHealthSettings()} className="press99" style={btn(true)}>
            {t('Get Health Connect')}
          </div>
        </>
      )}

      {avail?.ok && !prefs.on && (
        <>
          <div style={{ margin: '8px 0 16px' }}>
            {step(1, t('In your health app’s settings, turn on Health Connect. Google Fit does this by itself.'))}
            {step(2, t('Tap Connect below and allow Steps, Sleep and Exercise.'))}
          </div>
          <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : connect} className="press99" style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>
            {busy ? t('Connecting…') : t('Connect')}
          </div>
        </>
      )}

      {avail?.ok && prefs.on && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '16px 16px', margin: '8px 0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: none ? 'var(--danger)' : 'var(--success)' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{none ? t('Permission was taken away') : t('Connected')}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
              {prefs.lastSync ? t('Last synced {when}', { when: ago(prefs.lastSync) }) : t('Not synced yet')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
              {[today ? t('{n} steps today', { n: num(today.count) }) : null, tn(imported.nights, 'one night', '{n} nights'), tn(imported.workouts, 'one workout', '{n} workouts')].filter(Boolean).join(' · ')}
            </div>
            {!none && missing.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--warning)', marginTop: 8, lineHeight: 1.5 }}>{t('Not allowed yet: {what}. Allow them in Health Connect to bring them in.', { what: missing.join(', ') })}</div>
            )}
          </div>
          {granted && !granted.steps && (
            <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : connect} className="press99" style={btn(true)}>
              {t('Allow steps')}
            </div>
          )}
          {!habit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '12px 16px', margin: '8px 0' }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{t('Make your steps a habit that ticks itself when you reach your goal.')}</div>
              <div role="button" tabIndex={0} onClick={addStepsHabit} className="press" style={{ ...btn(false), height: 44, padding: '0 16px', marginTop: 0, flex: 'none' }}>
                {t('Add')}
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5, margin: '8px 2px 8px' }}>
            {t('Orpit syncs whenever you open it. Sleep quality for an imported night is estimated from its sleep stages; edit the night to change it.')}
          </div>
          <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : () => sync(false)} className="press99" style={{ ...btn(granted?.steps !== false), opacity: busy ? 0.6 : 1 }}>
            {busy ? t('Syncing…') : t('Sync now')}
          </div>
          <div role="button" tabIndex={0} onClick={() => openHealthSettings()} className="press99" style={btn(false)}>
            {t('Manage permissions')}
          </div>
          <div role="button" tabIndex={0} onClick={disconnect} style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--danger)', marginTop: 16, cursor: 'pointer' }}>
            {t('Stop syncing')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>{t('What’s already imported stays.')}</div>
        </>
      )}
    </div>
  );
}
