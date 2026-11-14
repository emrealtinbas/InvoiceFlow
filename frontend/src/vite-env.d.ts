/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the InvoiceFlow API. This value is public and must never
   * contain credentials or signing keys.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
