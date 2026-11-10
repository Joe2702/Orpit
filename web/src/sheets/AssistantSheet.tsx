import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api, API_BASE } from '../api';
import { ago } from '../lib/format';
import { setAssistantSetUp } from '../lib/assistant';
import { date, t } from '../i18n';

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

/** What to hand Claude: where to send the brief, the key, and the shape. */
export function claudeSetup(key: string, base: string = API_BASE || window.location.origin): string {
  return [
    'After writing the morning brief, also deliver it to my Orbit app:',
    '',
    `POST ${base}/api/assistant/brief`,
    `Header  X-Orbit-Key: ${key}`,
    'Header  Content-Type: application/json',
    'Body    {"title": "Morning brief", "sections": [{"heading": "Today\'s post", "body": "Markdown text"}, …]}',
    '',
    'One section per heading of the brief (up to 12), each body in Markdown (up to 8000 characters).',
    'The server may take up to a minute to wake: wait 90 seconds, and retry once if it fails.',
  ].join('\n');
}

/**
 * Claude's morning brief, delivered into Orbit. A key the person makes here
 * lets their scheduled Claude task post the brief it wrote; it shows at the
 * top of Orbit's brief. The key is shown once, then only when it was made.
 */
export function AssistantSheet() {
  const { confirm, showToast, haptic } = useStore();
  const [info, setInfo] = useState<{ exists: boolean; createdAt?: number; lastUsedAt?: number | null } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .assistantKey()
      .then((i) => {
        setInfo(i);
        setAssistantSetUp(i.exists);
      })
      .catch(() => setFailed(true));
  }, []);

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptic(10);
      showToast(done);
    } catch {
      showToast(t('Couldn’t copy. Press and hold the key to select it.'));
    }
  };

  const make = async () => {
    if (info?.exists && !(await confirm({ title: t('Make a new key?'), message: t('The old key stops working, so Claude will need the new one.'), confirmLabel: t('Make a new key') }))) return;
    setBusy(true);
    try {
      const r = await api.makeAssistantKey();
      setFresh(r.key);
      setInfo({ exists: true, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt });
      setAssistantSetUp(true);
    } catch {
      showToast(t('Couldn’t make a key. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!(await confirm({ title: t('Turn off Claude’s brief?'), message: t('The key stops working. Briefs already delivered stay until they’re replaced.'), confirmLabel: t('Turn off'), danger: true }))) return;
    setBusy(true);
    try {
      await api.revokeAssistantKey();
      setFresh(null);
      setInfo({ exists: false });
      setAssistantSetUp(false);
    } catch {
      showToast(t('Couldn’t turn it off. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const p: React.CSSProperties = { fontSize: 15, color: 'var(--text2)', lineHeight: 1.5, margin: '0 2px 12px' };

  return (
    <div style={{ padding: '8px 20px 32px' }}>
      <div className="display" style={{ fontSize: 28, lineHeight: 1.1, color: 'var(--text)', margin: '8px 2px 12px' }}>{t('Claude’s morning brief')}</div>
      <div style={p}>{t('If Claude writes you a morning brief on a schedule, it can send it here too. It shows at the top of your morning brief in Orbit, and you can open it from Home any time.')}</div>

      {failed && <div style={{ ...p, color: 'var(--danger)' }}>{t('Couldn’t reach Orbit. Check your connection and open this again.')}</div>}

      {fresh ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '8px 2px 8px' }}>{t('Your key')}</div>
          <div
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--text)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'calc(14px * var(--sq))',
              padding: '12px 16px',
              wordBreak: 'break-all',
              userSelect: 'all',
              WebkitUserSelect: 'all',
              direction: 'ltr',
              textAlign: 'left',
            }}
          >
            {fresh}
          </div>
          <div style={{ ...p, fontSize: 13, marginTop: 8 }}>{t('This is the only time Orbit shows it. Copy it into your Claude task now; if it’s lost, make a new one.')}</div>
          <div role="button" tabIndex={0} onClick={() => copy(claudeSetup(fresh), t('Copied. Paste it to Claude.'))} className="press" style={btn(true)}>
            {t('Copy instructions for Claude')}
          </div>
          <div role="button" tabIndex={0} onClick={() => copy(fresh, t('Key copied'))} className="press" style={btn(false)}>
            {t('Copy the key only')}
          </div>
        </>
      ) : info?.exists ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', padding: '16px 16px', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('On')}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}>
            {info.createdAt ? t('Key made {date}', { date: date(info.createdAt, { month: 'short', day: 'numeric' }) }) : ''}
            {' · '}
            {info.lastUsedAt ? t('last brief {ago}', { ago: ago(info.lastUsedAt) }) : t('no brief received yet')}
          </div>
        </div>
      ) : null}

      {info && (
        <>
          {!fresh && (
            <div role="button" tabIndex={0} aria-disabled={busy} onClick={() => !busy && make()} className="press" style={{ ...btn(!info.exists), opacity: busy ? 0.6 : 1 }}>
              {info.exists ? t('Make a new key') : t('Make a key for Claude')}
            </div>
          )}
          {info.exists && (
            <div role="button" tabIndex={0} onClick={() => !busy && revoke()} style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--danger)', padding: 16, marginTop: 8, cursor: 'pointer' }}>
              {t('Turn off')}
            </div>
          )}
        </>
      )}

      <div style={{ ...p, fontSize: 13, color: 'var(--text3)', marginTop: 16, marginBottom: 0 }}>
        {t('The key can only add a brief. It can’t read anything in your account or change it.')}
      </div>
    </div>
  );
}
