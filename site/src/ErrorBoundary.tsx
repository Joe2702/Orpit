import React from 'react';
import { isStaleFileError, loadNewVersion } from '@core/lib/freshVersion';
import { reportError } from './lib/crash';
import { t } from './i18n';
import { Button } from './ui/kit';

interface Props {
  children: React.ReactNode;
  /** A page's own boundary keeps the top bar and only replaces the page. */
  page?: boolean;
}
interface State {
  err: Error | null;
  reloading?: boolean;
}

/**
 * A crash shows a way out instead of an empty window. When the cause is a
 * file from an older version (the tab was open across an update), it loads
 * the new version instead, once.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error) {
    // Runs before the browser paints, so the message never flashes up.
    if (isStaleFileError(err) && loadNewVersion()) return this.setState({ reloading: true });
    reportError(err);
  }

  render() {
    const { err, reloading } = this.state;
    if (!err) return this.props.children;
    if (reloading) return null;
    return (
      <div
        role="alert"
        style={{
          minHeight: this.props.page ? '60vh' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          textAlign: 'center',
          padding: 24,
        }}
      >
        {!this.props.page && <span className="brand-mark" />}
        <div style={{ fontSize: 20, fontWeight: 600 }}>{t('Something went wrong')}</div>
        <div className="muted" style={{ maxWidth: 420 }}>
          {t('The error has been reported. Reloading usually fixes it, and your data is safe on the server.')}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button kind="primary" icon="repeat" onClick={() => window.location.reload()}>
            {t('Reload Orpit')}
          </Button>
          {this.props.page && (
            <Button kind="ghost" onClick={() => window.location.assign('/')}>
              {t('Overview')}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
