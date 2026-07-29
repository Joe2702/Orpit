import React from 'react';
import { reportError } from './lib/crash';

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
          fontFamily: "'Geist', system-ui, sans-serif",
        }}
      >
        <svg width="52" height="52" viewBox="0 0 24 24" style={{ marginBottom: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.9 }} aria-hidden>
          <circle cx="12" cy="11" r="6" />
          <ellipse cx="12" cy="11" rx="10.5" ry="4" transform="rotate(-24 12 11)" />
        </svg>
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Something went wrong</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, opacity: 0.9, maxWidth: 300, marginBottom: 26 }}>
          The error has been reported. Reloading usually fixes it — your data is safe on the server.
        </div>
        <div
          onClick={() => window.location.reload()}
          style={{ background: '#fff', color: '#4a45a6', height: 50, padding: '0 30px', borderRadius: 15, display: 'flex', alignItems: 'center', fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}
        >
          Reload Orbit
        </div>
      </div>
    );
  }
}
