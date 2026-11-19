/** Trims whitespace and trailing slashes so paths can be appended with a single `/`. */
export function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '')
}

/**
 * Origin of profound-baker-server, without a trailing slash, from VITE_API_BASE_URL (set at build
 * time). Empty means "same origin as the SPA", for when one reverse proxy serves both.
 */
export const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
