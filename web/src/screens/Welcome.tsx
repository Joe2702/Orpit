import React from 'react';
import { OrbitMark } from '../OrbitMark';
import { useStore } from '../store';
import { getLang, setLangPref, t } from '../i18n';

// The first screen anyone sees. Deliberately plain: the mark, the name set in
// the display serif, one sentence, two buttons. A gradient backdrop and a row
// of feature chips under a tagline is the stock layout of generated landing
// pages, and it made the app look like one.
export function Welcome() {
  const { go, setAuthMode } = useStore();
  const open = (mode: 'signup' | 'signin') => {
    setAuthMode(mode);
    go('signin');
  };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 28px',
        color: '#f0f0f3',
        background: '#0c0c0f',
        animation: 'fadeIn .5s ease',
      }}
    >
      {/* The language is chosen before anything else is read, so it's offered
          here in the other language's own words. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 'max(18px, env(safe-area-inset-top))' }}>
        <div
          role="button"
          tabIndex={0}
          lang={getLang() === 'ar' ? 'en' : 'ar'}
          onClick={() => setLangPref(getLang() === 'ar' ? 'en' : 'ar')}
          style={{ fontSize: 14.5, fontWeight: 600, color: 'rgba(240,240,243,.75)', padding: '10px 4px', cursor: 'pointer' }}
        >
          {getLang() === 'ar' ? 'English' : 'العربية'}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 48 }}>
        <OrbitMark size={60} style={{ marginBottom: 26 }} />
        <div className="display" style={{ fontSize: 64, lineHeight: 0.95 }}>{t('Orbit')}</div>
        <div style={{ fontSize: 18, lineHeight: 1.5, marginTop: 14, color: 'rgba(240,240,243,.72)', maxWidth: 300 }}>
          {t('Habits, training, sleep and money, kept in one place.')}
        </div>
      </div>
      <div style={{ paddingBottom: 'max(30px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div tabIndex={0}
          onClick={() => open('signup')}
          className="press"
          role="button"
          style={{ background: '#f0f0f3', color: '#0c0c0f', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 650, cursor: 'pointer' }}
        >
          {t('Create an account')}
        </div>
        <div tabIndex={0}
          onClick={() => open('signin')}
          role="button"
          style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'rgba(240,240,243,.75)', padding: 15, cursor: 'pointer' }}
        >
          {t('I already have one')}
        </div>
      </div>
    </div>
  );
}
