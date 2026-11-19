import { apiBaseUrl } from './config'

// A scheme (https:, data:, blob:, …) or a protocol-relative URL: already absolute.
const ABSOLUTE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/** Joins a base origin and a path; leaves absolute URLs untouched. */
export function joinUrl(base: string, path: string): string {
  if (ABSOLUTE_URL.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Makes an API-relative URL absolute, e.g. an item's `/uploads/items/<uuid>.jpg` for an <img>.
 * Missing values stay undefined so callers can fall back to a placeholder.
 */
export function apiUrl(path: string): string
export function apiUrl(path: string | null | undefined): string | undefined
export function apiUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return joinUrl(apiBaseUrl, path)
}
