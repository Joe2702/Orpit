import React from 'react';
import ReactDOM from 'react-dom/client';
// Fonts ship inside the app rather than coming from Google at launch: the app
// opens offline, and text never re-flows when a web font arrives late.
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/latin-400.css';
import './theme.css';
import { App } from './App';
import { StoreProvider } from './store';
import { ErrorBoundary } from './ErrorBoundary';
import { installCrashReporter } from './lib/crash';

const start = () =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <StoreProvider>
          <App />
        </StoreProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );

// The web demo runs against a stand-in server inside the page (src/demo.ts).
// VITE_DEMO is only set for that build, so a release bundle drops the branch
// and never includes the demo code.
if (import.meta.env.VITE_DEMO) {
  import('./demo').then((m) => {
    m.installDemo();
    start();
  });
} else {
  installCrashReporter();
  start();
}
