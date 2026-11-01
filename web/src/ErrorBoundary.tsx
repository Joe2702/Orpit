import React from 'react';
import { OrbitMark } from './OrbitMark';
import { reportError } from './lib/crash';
import { t } from './i18n';

interface State {
  err: Error | null;
}

/**
 * Catches render crashes so a bug shows a recoverable screen instead of a blank
 * white page, and reports it so the owner sees it.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error) {
    reportError(err);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 32,
          background: 'radial-gradient(125% 85% at 50% 32%, #605ac9 0%, #4a45a6 46%, #3b3789 100%)',
          color: '#fff',
          fontFamily: "'Geist Variable', 'Geist', system-ui, sans-serif",
        }}
      >
        <OrbitMark size={56} style={{ marginBottom: 18 }} />
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>{t('Something went wrong')}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, opacity: 0.9, maxWidth: 300, marginBottom: 26 }}>
          {t('The error has been reported. Reloading usually fixes it, and your data is safe on the server.')}
        </div>
        <div role="button" tabIndex={0}
          onClick={() => window.location.reload()}
          style={{ background: '#fff', color: '#4a45a6', height: 50, padding: '0 30px', borderRadius: 'calc(15px * var(--sq))', display: 'flex', alignItems: 'center', fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('Reload Orbit')}
        </div>
      </div>
    );
  }
}
