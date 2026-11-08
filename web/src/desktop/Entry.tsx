import React from 'react';
import { Space } from '../Space';
import { OrbitMark } from '../OrbitMark';
import { reducedMotion } from '../Motion';
import { t } from '../i18n';
import { DIcon, MOD_KEY, type DeskIcon } from './nav';
import './desktop.css';

/**
 * Before signing in (and during the first-run tour), the website shows the
 * phone's flow in a card floating in space, and beside it, on a wide window,
 * what Orbit is.
 */
export function DeskEntry({ hero, children }: { hero: boolean; children: React.ReactNode }) {
  const still = reducedMotion();
  const points: [DeskIcon, string][] = [
    ['habits', t('Habits and streaks that forgive one bad day')],
    ['money', t('Spending, budgets and bills, read from your bank texts on Android')],
    ['sleep', t('Sleep and training, side by side')],
    ['keyboard', t('Made for a keyboard here: {key} K jumps anywhere, N logs anything', { key: MOD_KEY })],
  ];
  return (
    <div className="desk-entry">
      <Space horizonTop="74%" animate={!still} />
      {hero && (
        <div className="desk-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: still ? undefined : 'fadeUp .7s cubic-bezier(.2,.8,.2,1) both' }}>
            <OrbitMark size={34} spin={!still} />
            <span className="display" style={{ fontSize: 30, lineHeight: 1 }}>Orbit</span>
          </div>
          <div className="display" style={{ fontSize: 'clamp(42px, 4.4vw, 60px)', lineHeight: 1.02, marginTop: 30, animation: still ? undefined : 'fadeUp .8s cubic-bezier(.2,.8,.2,1) .1s both' }}>
            {t('Your days, your money, your habits. One orbit.')}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(242,242,245,.66)', marginTop: 18, maxWidth: 420, animation: still ? undefined : 'fadeUp .8s cubic-bezier(.2,.8,.2,1) .2s both' }}>
            {t('Sign in with the same account as the phone app. What you log here is on your phone a moment later, and the other way round.')}
          </div>
          <div className="desk-hero-points">
            {points.map(([icon, text], i) => (
              <div key={icon} className="desk-hero-point" style={{ animationDelay: `${0.3 + i * 0.08}s` }}>
                <DIcon name={icon} size={20} />
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(242,242,245,.85)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="desk-entry-card">{children}</div>
    </div>
  );
}
