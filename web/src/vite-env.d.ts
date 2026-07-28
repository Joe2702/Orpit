/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Absolute backend URL for native (Capacitor) builds; empty on the web.
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by vite.config.ts at build time.
declare const __BUILD_ID__: string;
declare const __BUILT_AT__: string;
