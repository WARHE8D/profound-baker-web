import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

const HOURS_URL = 'http://localhost:8080/api/availability/working-hours'

beforeAll(async () => {
  await import('@/features/availability/AvailabilityPage')
})

async function openPage() {
  await signInAsOwner()
  const result = renderRoute('/owner/availability')
  await screen.findByRole('list', { name: 'Days of the week' })
  return result
}

const row = (day: string) =>
  within(screen.getByRole('list', { name: 'Days of the week' }))
    .getAllByRole('listitem')
    .find((li) => li.textContent?.startsWith(day))!
const field = (day: string, name: string) =>
  screen.getByRole('textbox', { name: `${day}: ${name}` })
const timeField = (day: string, name: string) => screen.getByLabelText(`${day}: ${name}`)
const save = () => screen.getByRole('button', { name: 'Save changes' })
const stored = (day: string) => mockStore.workingHours.find((h) => h.dayOfWeek === day)

async function setTime(day: string, name: string, value: string) {
  const input = timeField(day, name)
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

test('shows the week with its slots, closed days included', async () => {
  await openPage()

  expect(within(row('Monday')).getByText(/16 pickup slots, up to 32 orders a day/)).toBeVisible()
  expect(within(row('Saturday')).getByText(/8 pickup slots, up to 16 orders a day/)).toBeVisible()
  expect(row('Sunday')).toHaveTextContent("Guests can't pick up orders on Sundays.")
  expect(screen.getByText(/Open 6 days a week: 88 slots, up to 176 orders/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

test('saves changed days only: hours set, a day opened, a day closed', async () => {
  await openPage()
  const sent: string[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'GET') sent.push(`${request.method} ${new URL(request.url).pathname}`)
  })

  await setTime('Saturday', 'Closes', '14:00')
  await userEvent.click(within(row('Sunday')).getByRole('checkbox', { name: /Sunday/ }))
  await setTime('Sunday', 'Opens', '10:00')
  await setTime('Sunday', 'Closes', '12:00')
  await userEvent.click(within(row('Friday')).getByRole('checkbox', { name: /Friday/ }))
  await userEvent.click(save())

  expect(await screen.findByText('Working hours saved')).toBeInTheDocument()
  expect(sent.toSorted()).toEqual([
    'DELETE /api/availability/working-hours/FRIDAY',
    'PUT /api/availability/working-hours/SATURDAY',
    'PUT /api/availability/working-hours/SUNDAY',
  ])
  server.events.removeAllListeners()
  expect(stored('SATURDAY')).toMatchObject({ endTime: '14:00' })
  expect(stored('SUNDAY')).toMatchObject({ startTime: '10:00', endTime: '12:00' })
  expect(stored('FRIDAY')).toBeUndefined()
  expect(save()).toBeDisabled()
  // Guests now see the new hours.
  expect(mockStore.dayAvailability('2026-11-22').slots).toHaveLength(4)
})

test('checks the hours before saving', async () => {
  await openPage()

  await setTime('Monday', 'Closes', '07:00')
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Tuesday: Slot length' }),
    '2 h',
  )
  await setTime('Tuesday', 'Opens', '15:00')
  await userEvent.clear(field('Wednesday', 'Orders per slot'))
  await userEvent.click(save())

  expect(await within(row('Monday')).findByText('Close after you open')).toBeVisible()
  expect(
    within(row('Tuesday')).getByText('No slot this long fits between opening and closing'),
  ).toBeVisible()
  expect(within(row('Wednesday')).getByText('At least 1 order per slot')).toBeVisible()
  expect(stored('MONDAY')).toMatchObject({ endTime: '16:00' })
})

test('the preview follows unsaved edits and flags time that is not a whole slot', async () => {
  await openPage()
  const preview = screen.getByRole('region', { name: 'Preview' })

  await userEvent.click(within(preview).getByRole('button', { name: 'Saturday' }))
  await setTime('Saturday', 'Closes', '10:40')
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Saturday: Slot length' }),
    '45 min',
  )

  const slots = within(preview).getByRole('list', { name: 'Pickup slots on Saturday' })
  expect(
    within(slots)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['9:00 AM – 9:45 AM', '9:45 AM – 10:30 AM'])
  expect(within(row('Saturday')).getByText(/the last 10 min before closing/)).toBeVisible()

  await userEvent.click(within(preview).getByRole('button', { name: 'Sunday' }))
  expect(within(preview).getByText('Closed on Sundays: no pickup slots.')).toBeVisible()
})

test('copies one day’s settings to the other open days', async () => {
  await openPage()

  await setTime('Monday', 'Opens', '07:00')
  await userEvent.clear(field('Monday', 'Orders per slot'))
  await userEvent.type(field('Monday', 'Orders per slot'), '4')
  await userEvent.click(
    within(row('Monday')).getByRole('button', { name: 'Copy to other open days from Monday' }),
  )

  expect(timeField('Saturday', 'Opens')).toHaveValue('07:00')
  expect(field('Friday', 'Orders per slot')).toHaveValue('4')
  // Closed days stay closed.
  expect(within(row('Sunday')).getByRole('checkbox', { name: /Sunday/ })).not.toBeChecked()
})

test('a day the server rejects stays unsaved while the others are saved', async () => {
  await openPage()
  server.use(
    http.put(`${HOURS_URL}/TUESDAY`, () =>
      HttpResponse.json(
        {
          timestamp: '2026-01-01T00:00:00Z',
          status: 500,
          error: 'Internal Server Error',
          message: 'The server had a problem. Please try again in a moment.',
          path: '/api/availability/working-hours/TUESDAY',
          fieldErrors: null,
        },
        { status: 500, headers: { 'X-Request-Id': 'req-77' } },
      ),
    ),
  )

  await setTime('Monday', 'Closes', '17:00')
  await setTime('Tuesday', 'Closes', '17:00')
  await userEvent.click(save())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Not saved: Tuesday. The other days were saved.')
  expect(alert).toHaveTextContent('req-77')
  expect(stored('MONDAY')).toMatchObject({ endTime: '17:00' })
  expect(stored('TUESDAY')).toMatchObject({ endTime: '16:00' })
  expect(timeField('Tuesday', 'Closes')).toHaveValue('17:00')
  expect(save()).toBeEnabled()
})

test('asks before leaving with unsaved hours', async () => {
  const { router } = await openPage()

  await setTime('Monday', 'Closes', '17:00')
  await userEvent.click(screen.getByRole('link', { name: 'Items' }))

  const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
  expect(router.state.location.pathname).toBe('/owner/availability')
  await waitFor(() => expect(timeField('Monday', 'Closes')).toHaveValue('17:00'))
})
