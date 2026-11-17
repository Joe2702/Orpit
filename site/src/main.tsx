import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-arabic';
import './styles/app.css';
import { initI18n, langPref } from './i18n';
import { phoneLang } from '@core/i18n';
import { installUpdateReload } from '@core/lib/freshVersion';
import { installCrashReporter } from './lib/crash';

installCrashReporter();
installUpdateReload();

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
start().catch(() => {
  // Before React is up there's no error screen yet, so write one by hand.
  const root = document.getElementById('root');
  if (!root || root.childElementCount) return;
  const ar = (langPref() === 'auto' ? phoneLang() : langPref()) === 'ar';
  const [title, body, again] = ar
    ? ['لم يتم تحميل Orpit', 'تأكد من اتصالك بالإنترنت، ثم أعد تحميل الصفحة.', 'إعادة التحميل']
    : ['Orpit didn’t load', 'Check your connection, then reload the page.', 'Reload'];
  root.innerHTML =
    `<div dir="${ar ? 'rtl' : 'ltr'}" style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font:16px system-ui,sans-serif;text-align:center;padding:24px">` +
    `<div style="font-size:20px;font-weight:600">${title}</div>` +
    `<div style="opacity:.7">${body}</div>` +
    `<button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:10px;border:0;background:#5b54d6;color:#fff;cursor:pointer">${again}</button></div>`;
});
