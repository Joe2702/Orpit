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

installCrashReporter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
