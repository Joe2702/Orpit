import React from 'react';
import { useStore } from './store';

// A slim status pill shown only when something needs saying: the device is
// offline, or writes are still waiting to reach the server.
//
// This exists so offline never reads as data loss. Without it, entries logged
// on the metro look identical to entries that silently failed — and the second
// interpretation is the one people reach for.

export function SyncStatus() {
  const { pendingCount, online, isSyncing, sync, authed } = useStore();
  if (!authed) return null;
  if (online && pendingCount === 0) return null;

  const waiting = pendingCount > 0;
  const noun = pendingCount === 1 ? 'entry' : 'entries';
  const color = online ? 'var(--indigo)' : 'var(--warning)';
  // Only claim to be syncing while a flush is actually running. Queued entries
  // sitting behind a failing server used to spin here indefinitely, which reads
  // as "stuck" rather than "waiting, tap to retry".
  const label = !online
    ? waiting
      ? `Offline · ${pendingCount} waiting to sync`
      : 'Offline · your logs are saved on this device'
    : isSyncing
    ? `Syncing ${pendingCount} ${noun}…`
    : `${pendingCount} ${noun} waiting · tap to retry`;

  return (
    <div style={{ padding: '0 20px', marginBottom: 10 }}>
      <div
        onClick={() => online && sync()}
        role={online ? 'button' : undefined}
        className={online ? 'press99' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 13px',
          borderRadius: 12,
          fontSize: 12.5,
          fontWeight: 600,
          color,
          background: `color-mix(in srgb,${color} 11%,transparent)`,
          border: `1px solid color-mix(in srgb,${color} 28%,transparent)`,
          cursor: online ? 'pointer' : 'default',
        }}
      >
        {online ? (
          // The arrows only spin while a flush is genuinely running.
          <svg width="15" height="15" viewBox="0 0 20 20" style={{ flex: 'none', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', animation: isSyncing ? 'orbitSpin 1.1s linear infinite' : undefined }} aria-hidden>
            <path d="M4 8a6 6 0 0 1 10.5-3M16 4v4h-4" />
            <path d="M16 12a6 6 0 0 1-10.5 3M4 16v-4h4" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 20 20" style={{ flex: 'none', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <path d="M2 2l16 16" />
            <path d="M5.5 11.5a6 6 0 0 1 4-2M2.5 8a10 10 0 0 1 4-2.6M17.5 8a10 10 0 0 0-6.7-2.9" />
            <path d="M10 15.5h.01" />
          </svg>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      </div>
    </div>
  );
}
