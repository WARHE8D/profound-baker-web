/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the profound-baker-server API, e.g. http://localhost:8080. Unset = same origin. */
  readonly VITE_API_BASE_URL?: string
  /** ISO 4217 currency for prices, e.g. CAD. Default CAD. */
  readonly VITE_CURRENCY?: string
  /** BCP 47 locale for numbers and dates, e.g. en-US. Default en-US. */
  readonly VITE_LOCALE?: string
  /** "true" in `npm run dev:mock` (.env.mock): MSW answers API calls from fixtures. */
  readonly VITE_API_MOCKING?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
