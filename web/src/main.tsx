import React from 'react';
import ReactDOM from 'react-dom/client';
// Fonts ship inside the app rather than coming from Google at launch: the app
// opens offline, and text never re-flows when a web font arrives late.
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/latin-400.css';
import './fonts-arabic.css';
import './theme.css';
import { initI18n, installDigitShaper } from './i18n';
import { installCrashReporter } from './lib/crash';
import { installKeyActivation } from './lib/a11y';

installKeyActivation();

// Labels and month names are read as modules load, so the language is settled
// first and the app is imported after it.
const start = async () => {
  installDigitShaper(document.getElementById('root')!);
  const [{ App }, { StoreProvider }, { ErrorBoundary }] = await Promise.all([
    import('./App'),
    import('./store'),
    import('./ErrorBoundary'),
  ]);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <StoreProvider>
          <App />
        </StoreProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

// The web demo runs against a stand-in server inside the page (src/demo.ts).
// VITE_DEMO is only set for that build, so a release bundle drops the branch
// and never includes the demo code.
initI18n().then(() => {
  if (import.meta.env.VITE_DEMO) {
    import('./demo').then((m) => {
      m.installDemo();
      start();
    });
  } else {
    installCrashReporter();
    start();
  }
});
