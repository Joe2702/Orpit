import React from 'react';
import { isUnsynced } from './lib/offline';

/**
 * A small hollow ring on an entry that exists only on this device so far.
 *
 * Without it, something logged on the metro looks identical to something that
 * failed to save, and people assume the worse of the two. A quiet marker that
 * disappears on sync is enough to say "this is accounted for".
 */
export function UnsyncedDot({ id }: { id: string }) {
  if (!isUnsynced(id)) return null;
  return (
    <span
      title="Waiting to sync"
      aria-label="Waiting to sync"
      style={{
        width: 8,
        height: 8,
        flex: 'none',
        borderRadius: '50%',
        border: '1.6px solid var(--warning)',
      }}
    />
  );
}
