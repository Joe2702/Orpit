import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The desktop website. Its screens are its own; the arithmetic (balances,
// streaks, dates, money formatting) and the shared Arabic come from the phone
// app's source through @core, so both always agree on every number.
//
// Built files go under /d/ so they can sit next to the phone app's /assets/
// on the same server without either overwriting the other.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@core': fileURLToPath(new URL('../web/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  build: { assetsDir: 'd', outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5174,
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as never);
