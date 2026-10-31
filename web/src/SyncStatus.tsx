import React from 'react';
import { useStore } from './store';
import { probeServer } from './api';
import { t, tn } from './i18n';

// A slim status line shown only when something needs saying: the phone has no
// connection, Orbit isn't answering, or writes are still waiting to go out.
//
// This exists so offline never reads as data loss. Without it, entries logged
// on the metro look identical to entries that silently failed — and the second
// interpretation is the one people reach for.
//
// "No connection" and "reconnecting" are kept apart on purpose. The phone being
// offline is something the user can see and fix; the server taking a few
// seconds to wake is neither, and calling that "Offline" while every other app
// on the phone works is how the old pill lost people's trust.

export function SyncStatus() {
  const { pendingCount, connection, isSyncing, sync, authed } = useStore();
  const [retrying, setRetrying] = React.useState(false);
  if (!authed) return null;
  if (connection === 'online' && pendingCount === 0) return null;

  const waiting = pendingCount > 0;

  let tone: string;
  let title: string;
  let detail: string;
  let spinning = false;
  if (connection === 'offline') {
    tone = 'var(--warning)';
    title = t('No connection');
    detail = waiting
      ? tn(pendingCount, '{n} entry saved here · will sync when you’re back', '{n} entries saved here · will sync when you’re back')
      : t('Anything you log is saved on this phone');
  } else if (connection === 'unreachable') {
    tone = 'var(--text3)';
    title = t('Reconnecting to Orbit');
    detail = waiting
      ? tn(pendingCount, '{n} entry saved here · will sync automatically', '{n} entries saved here · will sync automatically')
      : t('Anything you log is saved on this phone');
    spinning = true;
  } else {
    tone = 'var(--indigo)';
    title = isSyncing ? t('Syncing') : tn(pendingCount, '{n} entry waiting', '{n} entries waiting');
    detail = isSyncing ? tn(pendingCount, 'Sending {n} entry…', 'Sending {n} entries…') : t('Tap to try again');
    spinning = isSyncing;
  }

  const tappable = connection !== 'offline' && !isSyncing && !retrying;
  const onTap = async () => {
    if (!tappable) return;
    if (connection === 'unreachable') {
      setRetrying(true);
      if (await probeServer()) await sync();
      setRetrying(false);
    } else sync();
  };

  return (
    <div style={{ padding: '0 20px', marginBottom: 12 }} aria-live="polite">
      <div tabIndex={0}
        onClick={onTap}
        role={tappable ? 'button' : 'status'}
        className={tappable ? 'press99' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '10px 14px',
          borderRadius: 'calc(14px * var(--sq))',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.04))',
          cursor: tappable ? 'pointer' : 'default',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'relative',
            width: 8,
            height: 8,
            flex: 'none',
            borderRadius: 99,
            background: tone,
            boxShadow: `0 0 0 4px color-mix(in srgb,${tone} 16%,transparent)`,
            animation: spinning || retrying ? 'orbitPulse 1.4s ease-in-out infinite' : undefined,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text)', letterSpacing: '-.005em', lineHeight: 1.25 }}>
            {retrying ? t('Checking…') : title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              lineHeight: 1.35,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {detail}
          </div>
        </div>
      </div>
    </div>
  );
}
