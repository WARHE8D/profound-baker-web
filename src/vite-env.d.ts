/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the profound-baker-server API, e.g. http://localhost:8080. Unset = same origin. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
