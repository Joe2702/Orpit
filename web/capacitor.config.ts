import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.orbit.app',
  appName: 'Orbit',
  // Vite builds the web app into web/dist; Capacitor bundles that into the
  // native shell. Rebuild (npm run build) before `npx cap sync`.
  webDir: 'dist',
  backgroundColor: '#0e0d1a',
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0e0d1a',
      showSpinner: false,
    },
  },
};

export default config;
