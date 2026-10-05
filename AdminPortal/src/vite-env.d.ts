/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Set in /config.js for IIS deploys without rebuilding. */
  __MAISON_API_URL__?: string;
}
