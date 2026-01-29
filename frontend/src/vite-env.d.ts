/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ALEO_PROGRAM_ID: string;
  readonly VITE_ALEO_NETWORK: string;
  readonly VITE_PROVABLE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
