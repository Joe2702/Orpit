import React, { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { FormHost } from './forms/host';
import { Shell } from './layout/Shell';
import { Overlays } from './layout/Overlays';
import { t } from './i18n';
import { Button } from './ui/kit';
import { Overview } from './pages/Overview';

const Habits = lazy(() => import('./pages/Habits').then((m) => ({ default: m.Habits })));
const Fitness = lazy(() => import('./pages/Fitness').then((m) => ({ default: m.Fitness })));
const Money = lazy(() => import('./pages/money/Money').then((m) => ({ default: m.Money })));
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Insights = lazy(() => import('./pages/Insights').then((m) => ({ default: m.Insights })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Auth = lazy(() => import('./pages/auth/Auth'));

const PUBLIC = ['/signin', '/signup', '/forgot', '/reset', '/verify'];

function Gate() {
  const { status, retry } = useStore();
  const loc = useLocation();
  const isPublic = PUBLIC.includes(loc.pathname);

  if (status === 'loading')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }} className="muted">
        <span className="brand-mark" style={{ animation: 'fade 1s ease infinite alternate' }} />
        {t('Loading your Orbit…')}
      </div>
    );
  if (status === 'error')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 650 }}>{t('Can’t reach Orbit right now')}</div>
        <div className="muted" style={{ maxWidth: 420 }}>{t('The server may be waking up, which can take up to a minute. Your data is safe.')}</div>
        <Button kind="primary" icon="repeat" onClick={retry}>
          {t('Try again')}
        </Button>
      </div>
    );

  if (status === 'out' || isPublic)
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/:page" element={<Auth />} />
          <Route path="*" element={<Navigate to={`/signin${loc.pathname !== '/' ? `?next=${encodeURIComponent(loc.pathname)}` : ''}`} replace />} />
        </Routes>
      </Suspense>
    );

  return (
    <FormHost>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
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

const Lazy = ({ el }: { el: React.ReactNode }) => (
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
);

// The demo build is published as a preview page under some other address, so
// it keeps its place in the part after # instead.
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <StoreProvider>
        <Gate />
        <Overlays />
      </StoreProvider>
    </Router>
  );
}
