import { api, isApiError, setAccessTokenProvider, setUnauthorizedHandler, unwrap } from '@/api'
import type { Schema } from '@/api'

/**
 * The Owner's session.
 *
 * - The access token (15 minutes) lives in this tab's memory only.
 * - The refresh token (14 days) lives in `localStorage`, shared by every tab. It is the only copy:
 *   each tab reads it from storage whenever it refreshes and stores the new one it gets back.
 * - The server accepts each refresh token once and treats a reused one as theft (signing out every
 *   session), so refreshes are serialized across tabs with a Web Lock. Inside the lock a tab reads
 *   the latest token, so a tab that waited uses the one the previous tab stored, never a spent one.
 * - Refreshing is lazy: a request that finds the access token expiring refreshes first, and a 401
 *   refreshes and retries once. Idle tabs don't refresh in the background.
 * - Signing out removes the refresh token; the `storage` event tells every other tab.
 */

export const REFRESH_TOKEN_KEY = 'sugarcrumbs.owner.refreshToken'
const REFRESH_LOCK = 'sugarcrumbs.owner.refresh'
/** Refresh this long before the access token expires, so a request never races the expiry. */
export const REFRESH_EARLY_MS = 60_000

/** Why the last session ended: the server refused to refresh it, or someone signed out. */
export type SessionEnd = 'expired' | 'signedOut'

export type SessionState =
  /** A refresh token is stored but not tried yet (page load). Owner pages restore it. */
  { status: 'unknown' } | { status: 'signedIn' } | { status: 'signedOut'; ended: SessionEnd | null }

type Tokens = Schema<'TokenResponse'>

type LockManagerLike = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>
}

type SessionDeps = {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** `navigator.locks`; without it (old browsers, jsdom) refreshes are serialized per tab only. */
  locks?: LockManagerLike | null
  now?: () => number
  /** Where `storage` events come from; null to not listen (tests drive them by hand). */
  events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
}

export type Session = ReturnType<typeof createSession>

export function createSession({
  storage = browserStorage(),
  locks = browserLocks(),
  now = Date.now,
  events = typeof window === 'undefined' ? null : window,
}: SessionDeps = {}) {
  let accessToken: string | null = null
  let expiresAt = 0
  let refreshing: Promise<string | null> | null = null
  let state: SessionState = initialState()
  const listeners = new Set<() => void>()

  function initialState(): SessionState {
    return readRefreshToken() ? { status: 'unknown' } : { status: 'signedOut', ended: null }
  }

  function readRefreshToken(): string | null {
    try {
      return storage?.getItem(REFRESH_TOKEN_KEY) ?? null
    } catch {
      return null
    }
  }

  function writeRefreshToken(token: string | null) {
    try {
      if (token) storage?.setItem(REFRESH_TOKEN_KEY, token)
      else storage?.removeItem(REFRESH_TOKEN_KEY)
    } catch {
      // Storage blocked: the session still works in this tab until it is closed.
    }
  }

  function setState(next: SessionState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  function start(tokens: Tokens) {
    accessToken = tokens.accessToken
    expiresAt = now() + tokens.expiresIn * 1000
    writeRefreshToken(tokens.refreshToken)
    if (state.status !== 'signedIn') setState({ status: 'signedIn' })
  }

  /** Forgets the session in this tab; `clearStorage` also ends it for the other tabs. */
  function end(ended: SessionEnd, { clearStorage = true } = {}) {
    accessToken = null
    expiresAt = 0
    if (clearStorage) writeRefreshToken(null)
    setState({ status: 'signedOut', ended })
  }

  const withRefreshLock = <T>(callback: () => Promise<T>): Promise<T> =>
    locks ? locks.request(REFRESH_LOCK, callback) : callback()

  /**
   * Swaps the stored refresh token for a new pair. One at a time per tab (callers share the
   * promise) and across tabs (the lock). Resolves to the new access token, or null when the server
   * refuses the refresh token (the session is over). Network and server errors reject and keep
   * the stored token, so a later try can still succeed.
   */
  function refresh(): Promise<string | null> {
    refreshing ??= withRefreshLock(async () => {
      const refreshToken = readRefreshToken()
      if (!refreshToken) {
        // Another tab signed out while this one waited for the lock.
        end('signedOut', { clearStorage: false })
        return null
      }
      try {
        start(await unwrap(api.POST('/api/auth/refresh', { body: { refreshToken } })))
        return accessToken
      } catch (error) {
        // 400/401: expired, revoked or already used. Anything else may be temporary.
        if (isApiError(error) && (error.status === 400 || error.status === 401)) {
          // Only clear the token we tried; another tab may have stored a newer one meanwhile.
          if (readRefreshToken() === refreshToken) writeRefreshToken(null)
          end('expired', { clearStorage: false })
          return null
        }
        throw error
      }
    }).finally(() => {
      refreshing = null
    })
    return refreshing
  }

  /** For the API client: the access token to send, refreshed first if it is about to expire. */
  async function getAccessToken(): Promise<string | null> {
    if (state.status !== 'signedIn') return null
    if (accessToken && now() < expiresAt - REFRESH_EARLY_MS) return accessToken
    try {
      return await refresh()
    } catch {
      // Couldn't refresh right now: send what we have and let the server decide.
      return accessToken
    }
  }

  /** For the API client: the server rejected `rejected` (401). A fresh token to retry with, or null. */
  async function onUnauthorized(rejected: string): Promise<string | null> {
    if (state.status !== 'signedIn') return null
    // Another request already refreshed while this one was in flight.
    if (accessToken && accessToken !== rejected) return accessToken
    try {
      return await refresh()
    } catch {
      return null
    }
  }

  function onStorage(event: StorageEvent) {
    // key is null when another tab called localStorage.clear().
    if (event.key !== REFRESH_TOKEN_KEY && event.key !== null) return
    const stored = readRefreshToken()
    if (!stored && state.status !== 'signedOut') {
      end('signedOut', { clearStorage: false })
    } else if (stored && state.status === 'signedOut') {
      // Signed in from another tab: owner pages here restore the session on their own.
      setState({ status: 'unknown' })
    }
  }
  events?.addEventListener('storage', onStorage)

  return {
    getState: (): SessionState => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Signs in; throws the ApiError (401 wrong credentials, 429 rate limited, …). */
    async login(email: string, password: string): Promise<void> {
      start(await unwrap(api.POST('/api/auth/login', { body: { email, password } })))
    },

    /**
     * Restores a stored session (after a reload). Resolves once the state is settled; rejects
     * when the server couldn't be asked (offline, 5xx), leaving the state `unknown` to retry.
     */
    async restore(): Promise<void> {
      if (state.status !== 'unknown') return
      await refresh()
    },

    /** Signs out here and in every other tab, then tells the server (best effort). */
    async logout(): Promise<void> {
      const refreshToken = readRefreshToken()
      end('signedOut')
      if (!refreshToken) return
      try {
        await unwrap(api.POST('/api/auth/logout', { body: { refreshToken } }))
      } catch {
        // Already signed out locally; the token expires on its own.
      }
    },

    getAccessToken,
    onUnauthorized,

    /** Stops listening to other tabs. */
    dispose() {
      events?.removeEventListener('storage', onStorage)
      listeners.clear()
    },

    /** Tests: forget everything in memory and re-read storage. */
    resetForTests() {
      accessToken = null
      expiresAt = 0
      refreshing = null
      state = initialState()
      listeners.forEach((listener) => listener())
    },
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function browserLocks(): LockManagerLike | null {
  return typeof navigator !== 'undefined' && 'locks' in navigator
    ? (navigator.locks as LockManagerLike)
    : null
}

/** The app's one session, wired into the API client. */
export const session = createSession()
setAccessTokenProvider(session.getAccessToken)
setUnauthorizedHandler(session.onUnauthorized)
