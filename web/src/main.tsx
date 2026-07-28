import React from 'react';
import ReactDOM from 'react-dom/client';
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
