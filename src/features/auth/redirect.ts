export const LOGIN_PATH = '/owner/login'
const HOME = '/owner'

/** The login URL that returns to `from` (a path in the dashboard) after signing in. */
export function loginPath(from: string | null): string {
  const next = from ? safeNext(from) : HOME
  return next === HOME ? LOGIN_PATH : `${LOGIN_PATH}?${new URLSearchParams({ next })}`
}

/**
 * Where to go after signing in. Only dashboard paths on this site are allowed, so a crafted
 * `?next=https://evil.example` or `//evil.example` link can't send the Owner elsewhere.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return HOME
  const url = new URL(next, 'https://app.invalid')
  if (url.origin !== 'https://app.invalid') return HOME
  const inDashboard = url.pathname === HOME || url.pathname.startsWith(`${HOME}/`)
  if (!inDashboard || url.pathname === LOGIN_PATH) return HOME
  return `${url.pathname}${url.search}${url.hash}`
}
