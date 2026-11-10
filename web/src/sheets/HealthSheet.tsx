import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ago } from '../lib/format';
import { connectHealth, healthAvailable, healthGranted, healthPrefs, openHealthSettings, setHealthPrefs, syncHealth } from '../lib/health';
import { t, tn } from '../i18n';

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

/**
 * Sleep and workouts from Fitbit, by way of Health Connect: what it does,
 * how to turn it on, and once it's on, when it last synced.
 */
export function HealthSheet() {
  const { state, applyState, showToast, haptic } = useStore();
  const [prefs, setPrefs] = useState(healthPrefs);
  const [avail, setAvail] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [granted, setGranted] = useState<{ sleep: boolean; workouts: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    healthAvailable().then((a) => {
      setAvail(a);
      if (a.ok) healthGranted().then(setGranted);
    });
  }, []);

  const imported = {
    nights: state!.nights.filter((n) => n.source).length,
    workouts: state!.workouts.filter((w) => w.source).length,
  };

  const sync = async (quiet = false) => {
    setBusy(true);
    try {
      const r = await syncHealth(state!);
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
    try {
      const g = await connectHealth();
      setGranted(g);
      if (!g.sleep && !g.workouts) {
        showToast(t('Allow Sleep and Exercise to bring them in'));
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
  };

  const disconnect = () => {
    haptic();
    const next = { on: false, lastSync: prefs.lastSync };
    setHealthPrefs(next);
    setPrefs(next);
    showToast(t('Stopped syncing'));
  };

  const P = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>{children}</div>;
  const step = (n: number, text: string) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', flex: 'none', background: 'color-mix(in srgb, var(--indigo) 15%, transparent)', color: 'var(--indigo)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>{text}</span>
    </div>
  );

  return (
    <div style={{ padding: '8px 20px 32px' }}>
      <div className="display" style={{ fontSize: 28, lineHeight: 1.1, color: 'var(--text)', margin: '8px 2px 12px' }}>{t('Sleep and workouts from Fitbit')}</div>
      <P>{t('Fitbit saves your sleep and workouts to Health Connect on this phone. Orbit reads them from there, so you never log them twice. Orbit only reads: it changes nothing in Fitbit or Health Connect.')}</P>

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
            {step(1, t('In the Fitbit app, open your profile, then settings, and turn on Health Connect.'))}
            {step(2, t('Tap Connect below and allow Sleep and Exercise.'))}
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
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: granted && !granted.sleep && !granted.workouts ? 'var(--danger)' : 'var(--success)' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {granted && !granted.sleep && !granted.workouts ? t('Permission was taken away') : t('Connected')}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
              {prefs.lastSync ? t('Last synced {when}', { when: ago(prefs.lastSync) }) : t('Not synced yet')}
              {' · '}
              {tn(imported.nights, 'one night', '{n} nights')}, {tn(imported.workouts, 'one workout', '{n} workouts')}
            </div>
            {granted && (!granted.sleep || !granted.workouts) && (granted.sleep || granted.workouts) && (
              <div style={{ fontSize: 13, color: 'var(--warning)', marginTop: 8 }}>{granted.sleep ? t('Exercise isn’t allowed, so workouts aren’t synced.') : t('Sleep isn’t allowed, so nights aren’t synced.')}</div>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5, margin: '8px 2px 8px' }}>
            {t('Orbit syncs whenever you open it. Sleep quality for an imported night is estimated from its sleep stages; edit the night to change it.')}
          </div>
          <div role="button" tabIndex={0} aria-disabled={busy} onClick={busy ? undefined : () => sync(false)} className="press99" style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>
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
