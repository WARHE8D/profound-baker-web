import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, unwrap } from '@/api'
import { FIXTURE_OWNER_CREDENTIALS } from '@/mocks/fixtures'
import { server } from '@/test/msw/server'
import { signInAsOwner } from '@/test/auth'
import {
  createSession,
  REFRESH_EARLY_MS,
  REFRESH_TOKEN_KEY,
  session,
  type Session,
} from './session'

const { email, password } = FIXTURE_OWNER_CREDENTIALS
const FIFTEEN_MINUTES = 15 * 60_000

/** Requests to /api/auth/*, with the Authorization header each carried. */
let authCalls: { path: string; authorization: string | null; body: unknown }[] = []

beforeEach(() => {
  authCalls = []
  server.events.on('request:start', async ({ request }) => {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/auth/')) return
    const body =
      request.method === 'POST'
        ? await request
            .clone()
            .json()
            .catch(() => null)
        : null
    authCalls.push({ path: pathname, authorization: request.headers.get('Authorization'), body })
  })
})

afterEach(() => {
  server.events.removeAllListeners()
  sessions.forEach((s) => s.dispose())
  sessions = []
})

const calls = (path: string) => authCalls.filter((c) => c.path === `/api/auth/${path}`)

/** A Map-backed localStorage, shared by the "tabs" (sessions) a test creates. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

/** A Web Locks stand-in: callbacks for the same lock run one after another. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  const requested: string[] = []
  return {
    requested,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      requested.push(name)
      const run = tail.then(callback)
      tail = run.catch(() => undefined)
      return run
    },
  }
}

let sessions: Session[] = []
function tab(deps: Parameters<typeof createSession>[0]) {
  const created = createSession({ events: null, ...deps })
  sessions.push(created)
  return created
}

test('signing in keeps the access token in memory and only the refresh token in storage', async () => {
  const storage = memoryStorage()
  const s = tab({ storage })

  expect(s.getState()).toEqual({ status: 'signedOut', ended: null })
  await s.login(email, password)

  expect(s.getState()).toEqual({ status: 'signedIn' })
  expect([...storage.map.keys()]).toEqual([REFRESH_TOKEN_KEY])
  expect(storage.map.get(REFRESH_TOKEN_KEY)).toMatch(/^mock-refresh-/)
  expect(await s.getAccessToken()).toMatch(/^mock-access-/)
  // Login sends no access token.
  expect(calls('login')[0]?.authorization).toBeNull()
})

test('a stored refresh token starts as unknown until it is restored', async () => {
  const storage = memoryStorage()
  await tab({ storage }).login(email, password)
  const reloaded = tab({ storage })

  expect(reloaded.getState()).toEqual({ status: 'unknown' })
  // Not restored by itself: public pages must not spend the refresh token.
  expect(await reloaded.getAccessToken()).toBeNull()

  await reloaded.restore()
  expect(reloaded.getState()).toEqual({ status: 'signedIn' })
  expect(await reloaded.getAccessToken()).toMatch(/^mock-access-/)
})

test('refreshes shortly before the access token expires, once for concurrent callers', async () => {
  let now = 1_000_000
  const storage = memoryStorage()
  const s = tab({ storage, now: () => now })
  await s.login(email, password)
  const first = await s.getAccessToken()
  const firstRefresh = storage.map.get(REFRESH_TOKEN_KEY)

  now += FIFTEEN_MINUTES - REFRESH_EARLY_MS - 1
  expect(await s.getAccessToken()).toBe(first)
  expect(calls('refresh')).toHaveLength(0)

  now += 1
  const tokens = await Promise.all([s.getAccessToken(), s.getAccessToken(), s.getAccessToken()])

  expect(calls('refresh')).toHaveLength(1)
  expect(calls('refresh')[0]).toMatchObject({
    authorization: null,
    body: { refreshToken: firstRefresh },
  })
  expect(new Set(tokens).size).toBe(1)
  expect(tokens[0]).not.toBe(first)
  expect(storage.map.get(REFRESH_TOKEN_KEY)).not.toBe(firstRefresh)
})

test('two tabs refreshing at once take turns and never reuse a refresh token', async () => {
  const storage = memoryStorage()
  const locks = fakeLocks()
  await tab({ storage, locks }).login(email, password)
  const tabA = tab({ storage, locks })
  const tabB = tab({ storage, locks })

  await Promise.all([tabA.restore(), tabB.restore()])

  expect(locks.requested).toEqual(['sugarcrumbs.owner.refresh', 'sugarcrumbs.owner.refresh'])
  const sent = calls('refresh').map((c) => (c.body as { refreshToken: string }).refreshToken)
  expect(sent).toHaveLength(2)
  expect(new Set(sent).size).toBe(2)
  expect(tabA.getState()).toEqual({ status: 'signedIn' })
  expect(tabB.getState()).toEqual({ status: 'signedIn' })
})

test('a refused refresh token ends the session as expired', async () => {
  const storage = memoryStorage()
  storage.setItem(REFRESH_TOKEN_KEY, 'mock-refresh-already-used')
  const s = tab({ storage })
  server.use(
    http.post('*/api/auth/refresh', () =>
      HttpResponse.json(
        { status: 401, message: 'refresh token was already used' },
        { status: 401 },
      ),
    ),
  )

  await s.restore()

  expect(s.getState()).toEqual({ status: 'signedOut', ended: 'expired' })
  expect(storage.map.has(REFRESH_TOKEN_KEY)).toBe(false)
})

test('a failed refresh (offline) keeps the refresh token for another try', async () => {
  const storage = memoryStorage()
  storage.setItem(REFRESH_TOKEN_KEY, 'mock-refresh-kept')
  const s = tab({ storage })
  server.use(http.post('*/api/auth/refresh', () => HttpResponse.error()))

  await expect(s.restore()).rejects.toMatchObject({ status: 0 })

  expect(s.getState()).toEqual({ status: 'unknown' })
  expect(storage.map.get(REFRESH_TOKEN_KEY)).toBe('mock-refresh-kept')
})

test('signing out clears storage and tells the server', async () => {
  const storage = memoryStorage()
  const s = tab({ storage })
  await s.login(email, password)
  const refreshToken = storage.map.get(REFRESH_TOKEN_KEY)

  await s.logout()

  expect(s.getState()).toEqual({ status: 'signedOut', ended: 'signedOut' })
  expect(storage.map.has(REFRESH_TOKEN_KEY)).toBe(false)
  // The recorder reads the body asynchronously.
  await vi.waitFor(() =>
    expect(calls('logout')[0]).toMatchObject({ authorization: null, body: { refreshToken } }),
  )
  expect(await s.getAccessToken()).toBeNull()
})

test('follows sign-out and sign-in in other tabs through storage events', async () => {
  const storage = memoryStorage()
  const events = new EventTarget()
  const s = tab({ storage, events: events as unknown as Window })
  await s.login(email, password)

  storage.removeItem(REFRESH_TOKEN_KEY)
  events.dispatchEvent(new StorageEvent('storage', { key: REFRESH_TOKEN_KEY, newValue: null }))
  expect(s.getState()).toEqual({ status: 'signedOut', ended: 'signedOut' })
  expect(await s.getAccessToken()).toBeNull()

  storage.setItem(REFRESH_TOKEN_KEY, 'mock-refresh-from-other-tab')
  events.dispatchEvent(new StorageEvent('storage', { key: REFRESH_TOKEN_KEY }))
  expect(s.getState()).toEqual({ status: 'unknown' })
})

test('the API client sends the access token and retries once with a fresh one after a 401', async () => {
  await signInAsOwner()
  const before = await session.getAccessToken()
  let rejectOnce = true
  server.use(
    http.get('*/api/auth/me', ({ request }) => {
      if (!rejectOnce) return undefined // fall through to the default mock
      rejectOnce = false
      expect(request.headers.get('Authorization')).toBe(`Bearer ${before}`)
      return HttpResponse.json({ status: 401, message: 'token expired' }, { status: 401 })
    }),
  )

  const me = await unwrap(api.GET('/api/auth/me'))

  expect(me.email).toBe(email)
  expect(calls('refresh')).toHaveLength(1)
  const meCalls = calls('me')
  expect(meCalls).toHaveLength(2)
  expect(meCalls[1]?.authorization).toMatch(/^Bearer mock-access-/)
  expect(meCalls[1]?.authorization).not.toBe(`Bearer ${before}`)
})

test('a 401 that a refresh cannot fix ends the session', async () => {
  await signInAsOwner()
  server.use(
    http.post('*/api/auth/refresh', () =>
      HttpResponse.json({ status: 401, message: 'revoked' }, { status: 401 }),
    ),
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ status: 401, message: 'revoked' }, { status: 401 }),
    ),
  )

  await expect(unwrap(api.GET('/api/auth/me'))).rejects.toMatchObject({ status: 401 })
  expect(session.getState()).toEqual({ status: 'signedOut', ended: 'expired' })
  expect(calls('me')).toHaveLength(1)
})

test('public requests carry no token when nobody is signed in', async () => {
  await unwrap(api.GET('/api/public/bakery'))
  expect(session.getState().status).toBe('signedOut')
  expect(calls('refresh')).toHaveLength(0)
})
