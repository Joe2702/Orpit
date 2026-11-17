import React, { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { FormHost } from './forms/host';
import { Shell } from './layout/Shell';
import { Overlays } from './layout/Overlays';
import { t } from './i18n';
import { Button } from './ui/kit';
import { Overview } from './pages/Overview';
import { ErrorBoundary } from './ErrorBoundary';
import { loadFresh } from '@core/lib/freshVersion';

// Each page's code is fetched the first time it's opened. loadFresh covers a
// tab that was open across an update: the old file is gone, so it loads the
// new version instead of leaving the window empty.
const Habits = lazy(loadFresh(() => import('./pages/Habits').then((m) => ({ default: m.Habits }))));
const Fitness = lazy(loadFresh(() => import('./pages/Fitness').then((m) => ({ default: m.Fitness }))));
const Money = lazy(loadFresh(() => import('./pages/money/Money').then((m) => ({ default: m.Money }))));
const Tasks = lazy(loadFresh(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks }))));
const Insights = lazy(loadFresh(() => import('./pages/Insights').then((m) => ({ default: m.Insights }))));
const Settings = lazy(loadFresh(() => import('./pages/Settings').then((m) => ({ default: m.Settings }))));
const Auth = lazy(loadFresh(() => import('./pages/auth/Auth')));

const PUBLIC = ['/signin', '/signup', '/forgot', '/reset', '/verify'];

function Gate() {
  const { status, retry } = useStore();
  const loc = useLocation();
  const isPublic = PUBLIC.includes(loc.pathname);

  if (status === 'loading')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }} className="muted">
        <span className="brand-mark" style={{ animation: 'fade 1s ease infinite alternate' }} />
        {t('Loading your Orpit…')}
      </div>
    );
  if (status === 'error')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{t('Can’t reach Orpit right now')}</div>
        <div className="muted" style={{ maxWidth: 420 }}>{t('The server may be waking up, which can take up to a minute. Your data is safe.')}</div>
        <Button kind="primary" icon="repeat" onClick={retry}>
          {t('Try again')}
        </Button>
      </div>
    );

  if (status === 'out' || isPublic)
    return (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/:page" element={<Auth />} />
            <Route path="*" element={<Navigate to={`/signin${loc.pathname !== '/' ? `?next=${encodeURIComponent(loc.pathname)}` : ''}`} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );

  return (
    <FormHost>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Lazy el={<Overview />} />} />
          <Route path="habits/*" element={<Lazy el={<Habits />} />} />
          <Route path="fitness/*" element={<Lazy el={<Fitness />} />} />
          <Route path="money/*" element={<Lazy el={<Money />} />} />
          <Route path="tasks/:listId?" element={<Lazy el={<Tasks />} />} />
          <Route path="insights" element={<Lazy el={<Insights />} />} />
          <Route path="settings/:section?" element={<Lazy el={<Settings />} />} />
          <Route path="welcome" element={<Lazy el={<Settings setup />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </FormHost>
  );
}

// A page that fails shows its own message under the top bar, so the rest of
// the site still works. Keyed by section, so moving to another page clears it.
function Lazy({ el }: { el: React.ReactNode }) {
  const section = useLocation().pathname.split('/')[1] || 'overview';
  return (
    <ErrorBoundary page key={section}>
      <Suspense
        fallback={
          <div className="page">
            <div className="skeleton" style={{ height: 30, width: 220, marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 320 }} />
          </div>
        }
      >
        {el}
      </Suspense>
    </ErrorBoundary>
  );
}

// The demo build is published as a preview page under some other address, so
// it keeps its place in the part after # instead.
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

export function App() {
  return (
    <ErrorBoundary>
      <Router>
        <StoreProvider>
          <Gate />
          <Overlays />
        </StoreProvider>
      </Router>
    </ErrorBoundary>
  );
}
