/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 正式版後端基底 URL;空字串=相對路徑(由 nginx 反代)。見 api/client.ts */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
