/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the profound-baker-server API, e.g. http://localhost:8080 */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
