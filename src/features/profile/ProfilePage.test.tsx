import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { REFRESH_TOKEN_KEY, session } from '@/features/auth/session'
import { bakeryQuery } from '@/features/checkout/queries'
import { FIXTURE_OWNER_CREDENTIALS, ids } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

beforeAll(async () => {
  await Promise.all([import('@/features/profile/ProfilePage'), import('@/features/auth/LoginPage')])
})

const NEW_PASSWORD = 'correct horse battery staple'

async function openProfile() {
  await signInAsOwner()
  const result = renderRoute('/owner/profile')
  await screen.findByRole('textbox', { name: /^Bakery name/ })
  return result
}

const field = (name: RegExp) => screen.getByRole('textbox', { name })
const zonePicker = () => screen.getByRole('combobox', { name: /^Time zone/ })
const saveButton = () => screen.getByRole('button', { name: 'Save changes' })
const sidebar = () => screen.getByRole('complementary')

async function fillPassword(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByLabelText(/^Current password/), current)
  await userEvent.type(screen.getByLabelText(/^New password/), next)
  await userEvent.type(screen.getByLabelText(/^Confirm new password/), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

test('shows the saved profile in the form', async () => {
  await openProfile()

  expect(field(/^Bakery name/)).toHaveValue('SugarCrumbs')
  expect(field(/^Your name/)).toHaveValue('Sam Baker')
  expect(field(/^Phone/)).toHaveValue('+1 555 0100')
  expect(field(/^Street/)).toHaveValue('12 Flour Street')
  expect(zonePicker()).toHaveValue('America/New_York')
  // Nothing to save until something changes.
  expect(saveButton()).toBeDisabled()
})

test('saves the details and updates the name in the sidebar', async () => {
  await openProfile()
  expect(await within(sidebar()).findByText('Sam Baker')).toBeInTheDocument()

  await userEvent.clear(field(/^Your name/))
  await userEvent.type(field(/^Your name/), 'Sam Okafor')
  await userEvent.clear(field(/^Phone/))
  await userEvent.click(saveButton())

  expect(await screen.findByText('Profile saved')).toBeInTheDocument()
  expect(mockStore.profile).toMatchObject({ ownerName: 'Sam Okafor', phone: null })
  expect(await within(sidebar()).findByText('Sam Okafor')).toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
})

test('changing the time zone warns first, then refreshes every time on screen and in the cache', async () => {
  const { queryClient } = await openProfile()
  // The storefront's bakery details (and its time zone) are cached from an earlier visit.
  await queryClient.fetchQuery(bakeryQuery())

  await userEvent.selectOptions(zonePicker(), 'Europe/London')
  expect(screen.getByText(/Changing the time zone moves your working hours/)).toBeInTheDocument()
  await userEvent.click(saveButton())

  expect(await screen.findByText('Times now show in Europe/London.')).toBeInTheDocument()
  expect(mockStore.profile.timeZone).toBe('Europe/London')
  expect(queryClient.getQueryState(bakeryQuery().queryKey)?.isInvalidated).toBe(true)
  await waitFor(() =>
    expect(screen.queryByText(/Changing the time zone moves/)).not.toBeInTheDocument(),
  )
})

test('puts the server’s time-zone refusal on the picker', async () => {
  server.use(
    http.put('*/api/owner/profile', () =>
      HttpResponse.json(
        { status: 400, message: "timeZone must be an IANA time zone id such as 'Europe/London'" },
        { status: 400 },
      ),
    ),
  )
  await openProfile()

  await userEvent.selectOptions(zonePicker(), 'Europe/London')
  await userEvent.click(saveButton())

  expect(
    await screen.findByText(
      'The server doesn’t accept this time zone. Choose a city in the same zone.',
    ),
  ).toBeInTheDocument()
  expect(zonePicker()).toHaveAttribute('aria-invalid', 'true')
})

test('checks required fields and the logo address before saving', async () => {
  let puts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PUT') puts += 1
  })
  await openProfile()

  await userEvent.clear(field(/^Bakery name/))
  await userEvent.type(field(/^Logo URL/), 'logo.png')
  await userEvent.click(saveButton())

  expect(await screen.findByText('Enter the bakery’s name')).toBeInTheDocument()
  expect(screen.getByText('Enter a full web address starting with https://')).toBeInTheDocument()
  expect(field(/^Bakery name/)).toHaveFocus()
  expect(puts).toBe(0)
  server.events.removeAllListeners()
})

test('shows the server’s field errors on their fields', async () => {
  server.use(
    http.put('*/api/owner/profile', () =>
      HttpResponse.json(
        {
          status: 400,
          message: 'validation failed',
          fieldErrors: [{ field: 'address.postalCode', message: 'size must be between 0 and 20' }],
        },
        { status: 400 },
      ),
    ),
  )
  await openProfile()

  await userEvent.type(field(/^Postal code/), '9')
  await userEvent.click(saveButton())

  expect(await screen.findByText('Size must be between 0 and 20')).toBeInTheDocument()
  expect(field(/^Postal code/)).toHaveFocus()
})

test('Discard puts the saved values back', async () => {
  await openProfile()

  await userEvent.clear(field(/^City/))
  await userEvent.type(field(/^City/), 'Queens')
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

  expect(field(/^City/)).toHaveValue('Brooklyn')
  expect(saveButton()).toBeDisabled()
})

test('changes the password and stays signed in with a new session', async () => {
  await openProfile()
  const oldRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

  await fillPassword(FIXTURE_OWNER_CREDENTIALS.password, NEW_PASSWORD)

  expect(await screen.findByText('Password changed')).toBeInTheDocument()
  expect(screen.getByText('Other devices have been signed out.')).toBeInTheDocument()
  expect(mockStore.password).toBe(NEW_PASSWORD)
  expect(session.getState()).toEqual({ status: 'signedIn' })
  expect(localStorage.getItem(REFRESH_TOKEN_KEY)).not.toBe(oldRefreshToken)
  expect(screen.getByLabelText(/^Current password/)).toHaveValue('')
  // The setup-password reminder is done for this Owner.
  expect(localStorage.getItem(`sugarcrumbs.owner.passwordReminder.${ids.owner}`)).not.toBeNull()
})

test('checks the new password before sending it', async () => {
  await openProfile()

  await fillPassword('whatever', 'too short', 'too shorts')

  expect(await screen.findByText('Use at least 12 characters')).toBeInTheDocument()
  expect(screen.getByText('The passwords don’t match')).toBeInTheDocument()
  expect(mockStore.password).toBe(FIXTURE_OWNER_CREDENTIALS.password)
})

test('says when the current password is wrong', async () => {
  await openProfile()

  await fillPassword('not-my-password', NEW_PASSWORD)

  expect(await screen.findByText('That isn’t your current password')).toBeInTheDocument()
  expect(screen.getByLabelText(/^Current password/)).toHaveFocus()
  expect(session.getState()).toEqual({ status: 'signedIn' })
})

test('asks to sign in again if signing back in after the change fails', async () => {
  await openProfile()
  server.use(
    http.post('*/api/auth/login', () =>
      HttpResponse.json({ status: 503, message: 'Service unavailable' }, { status: 503 }),
    ),
  )

  await fillPassword(FIXTURE_OWNER_CREDENTIALS.password, NEW_PASSWORD)

  expect(await screen.findByText('Please sign in with your new password.')).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Owner sign in' })).toBeInTheDocument()
  expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull()
})

test('reminds the Owner to replace the setup password until it is dismissed', async () => {
  await signInAsOwner()
  renderRoute('/owner/orders')

  const reminder = await screen.findByRole('region', { name: 'Password reminder' })
  expect(within(reminder).getByRole('link', { name: 'Change password' })).toHaveAttribute(
    'href',
    '/owner/profile#password',
  )

  await userEvent.click(within(reminder).getByRole('link', { name: 'Change password' }))
  // Straight to the password form, ready to type.
  expect(await screen.findByLabelText(/^Current password/)).toHaveFocus()
  expect(screen.queryByRole('region', { name: 'Password reminder' })).not.toBeInTheDocument()

  await userEvent.click(within(sidebar()).getAllByRole('link', { name: 'Orders' })[0]!)
  const again = await screen.findByRole('region', { name: 'Password reminder' })
  await userEvent.click(within(again).getByRole('button', { name: /^Dismiss/ }))
  expect(screen.queryByRole('region', { name: 'Password reminder' })).not.toBeInTheDocument()
  expect(localStorage.getItem(`sugarcrumbs.owner.passwordReminder.${ids.owner}`)).not.toBeNull()
})
