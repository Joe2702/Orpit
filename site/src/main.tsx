import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-arabic';
import './styles/app.css';
import { initI18n } from './i18n';

// A desktop site doesn't need the phone app's offline worker; one left over
// from an earlier visit would answer with the phone layout, so it goes.
navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});

async function start() {
  if (import.meta.env.VITE_DEMO) {
    const m = await import('@core/demo');
    m.installDemo();
  }
  await initI18n();
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
start();
