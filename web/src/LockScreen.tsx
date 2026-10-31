import React, { useEffect, useRef } from 'react';
import { OrbitMark } from './OrbitMark';
import { unlock } from './lib/appLock';
import { t } from './i18n';

/**
 * Covers the app until the phone's own unlock passes. Asks straight away when
 * it appears, and offers a button for when the prompt was dismissed.
 */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const asking = useRef(false);
  const ask = async () => {
    if (asking.current) return;
    asking.current = true;
    const ok = await unlock();
    asking.current = false;
    if (ok) onUnlocked();
  };
  useEffect(() => {
    ask();
    // Asked once on appearing; after that, only when the button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Orbit is locked')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: '#0c0c0f',
        color: '#f0f0f3',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '0 32px',
      }}
    >
      <OrbitMark size={60} />
      <div className="display" style={{ fontSize: 34 }}>{t('Orbit is locked')}</div>
      <button
        onClick={ask}
        className="press"
        style={{ marginTop: 8, background: '#f0f0f3', color: '#0c0c0f', border: 'none', height: 52, padding: '0 34px', borderRadius: 'calc(16px * var(--sq))', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
      >
        {t('Unlock')}
      </button>
    </div>
  );
}
