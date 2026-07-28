import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Real build identity so testers can tell you exactly which APK they have.
// CI passes GITHUB_RUN_NUMBER; local builds fall back to "dev".
const BUILD = process.env.VITE_BUILD_ID || process.env.GITHUB_RUN_NUMBER || 'dev';
const BUILT_AT = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(String(BUILD)),
    __BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
