import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { FIXTURE_OWNER_CREDENTIALS } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'
import { REFRESH_TOKEN_KEY, session } from './session'

// /owner/login is lazy-loaded; load it once up front so no test waits on compiling it.
beforeAll(async () => {
  await import('@/features/auth/LoginPage')
})

const { email, password } = FIXTURE_OWNER_CREDENTIALS

async function signInWith(user: string = email, pass: string = password) {
  await screen.findByRole('heading', { name: 'Owner sign in' })
  if (user) await userEvent.type(screen.getByLabelText(/^Email/), user)
  if (pass) await userEvent.type(screen.getByLabelText(/^Password/), pass)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

/** Simulates a page reload: memory is gone, localStorage (the refresh token) stays. */
function reload() {
  session.resetForTests()
}

test('a signed-out Owner is sent to sign in, then back to the page they opened', async () => {
  const { router } = renderRoute('/owner/orders?status=PENDING')

  await signInWith()

  expect(await screen.findByRole('heading', { level: 1, name: 'Orders' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/owner/orders')
  expect(router.state.location.search).toBe('?status=PENDING')
  // Who is signed in, from /api/auth/me.
  expect(await screen.findByText(email)).toBeInTheDocument()
})

test('says so when the email and password don’t match, and clears the password', async () => {
  renderRoute('/owner/login')

  await signInWith(email, 'wrong-password')

  expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match.")
  expect(screen.getByLabelText(/^Password/)).toHaveValue('')
  expect(screen.getByLabelText(/^Password/)).toHaveFocus()
  expect(session.getState().status).toBe('signedOut')
})

test('asks for both fields before sending anything', async () => {
  let logins = 0
  server.events.on('request:start', ({ request }) => {
    if (request.url.endsWith('/api/auth/login')) logins += 1
  })
  renderRoute('/owner/login')

  await signInWith('', '')

  expect(screen.getByText('Enter your email address')).toBeInTheDocument()
  expect(screen.getByText('Enter your password')).toBeInTheDocument()
  expect(screen.getByLabelText(/^Email/)).toHaveFocus()
  expect(logins).toBe(0)
  server.events.removeAllListeners()
})

test('a rate-limited sign-in shows the wait and holds the button', async () => {
  server.use(
    http.post('*/api/auth/login', () =>
      HttpResponse.json(
        { status: 429, message: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '45', 'X-Request-Id': 'req-429' } },
      ),
    ),
  )
  renderRoute('/owner/login')

  await signInWith()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Too many sign-in attempts. Please wait 45 seconds',
  )
  expect(screen.getByRole('alert')).toHaveTextContent('req-429')
  expect(screen.getByRole('button', { name: 'Try again in 45 s' })).toBeDisabled()
})

test('a reload restores the session without asking for the password', async () => {
  await signInAsOwner()
  reload()
  expect(session.getState().status).toBe('unknown')

  renderRoute('/owner/items')

  expect(await screen.findByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Owner sign in' })).not.toBeInTheDocument()
})

test('an ended session goes to sign in with a note, and comes back afterwards', async () => {
  localStorage.setItem(REFRESH_TOKEN_KEY, 'mock-refresh-revoked-long-ago')
  server.use(
    http.post(
      '*/api/auth/refresh',
      () =>
        HttpResponse.json({ status: 401, message: 'refresh token is invalid' }, { status: 401 }),
      { once: true },
    ),
  )
  reload()
  const { router } = renderRoute('/owner/invoices')

  expect(
    await screen.findByText('Your session has ended. Please sign in again.'),
  ).toBeInTheDocument()
  expect(router.state.location.search).toBe('?next=%2Fowner%2Finvoices')

  await signInWith()
  expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument()
})

test('offers a retry when the session can’t be checked (offline)', async () => {
  await signInAsOwner()
  server.use(http.post('*/api/auth/refresh', () => HttpResponse.error(), { once: true }))
  reload()
  renderRoute('/owner')

  expect(await screen.findByText("We couldn't check your session")).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
})

test('signing out ends the session and shows the sign-in page', async () => {
  await signInAsOwner()
  const { router } = renderRoute('/owner/orders')
  const sidebar = await screen.findByRole('complementary')

  await userEvent.click(within(sidebar).getAllByRole('button', { name: 'Sign out' })[0]!)

  expect(await screen.findByText('You have signed out.')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/owner/login')
  expect(router.state.location.search).toBe('')
  expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull()
})

test('signing out in another tab signs this one out too', async () => {
  await signInAsOwner()
  renderRoute('/owner')
  await screen.findByRole('heading', { level: 1, name: 'Dashboard' })

  act(() => {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_TOKEN_KEY, newValue: null }))
  })

  expect(await screen.findByText('You have signed out.')).toBeInTheDocument()
})

test('the sign-in page sends a signed-in Owner on to the dashboard', async () => {
  await signInAsOwner()
  const { router } = renderRoute('/owner/login?next=%2Fowner%2Fprofile')

  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/profile'))
})

test('ignores a next link that points off the dashboard', async () => {
  const { router } = renderRoute('/owner/login?next=https%3A%2F%2Fevil.example%2Fowner')

  await signInWith()

  await waitFor(() => expect(router.state.location.pathname).toBe('/owner'))
})
