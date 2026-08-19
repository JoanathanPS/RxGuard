/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_API?: string;
  readonly VITE_PATIENT_API?: string;
  readonly VITE_PRESCRIPTION_API?: string;
  readonly VITE_INTERACTION_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}