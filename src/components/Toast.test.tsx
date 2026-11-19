import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { useToast, type ToastOptions } from './toast-context'

afterEach(() => {
  vi.useRealTimers()
})

function Trigger({ options }: { options: ToastOptions }) {
  const { toast } = useToast()
  return <button onClick={() => toast(options)}>Notify</button>
}

function renderWithTrigger(options: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  )
  return screen.getByRole('button', { name: 'Notify' })
}

test('shows the toast inside a polite live region', async () => {
  const trigger = renderWithTrigger({ title: 'Item saved', description: 'Croissant' })

  await userEvent.click(trigger)

  const region = screen.getByRole('region', { name: 'Notifications' })
  expect(within(region).getByText('Item saved')).toBeInTheDocument()
  expect(within(region).getByText('Croissant')).toBeInTheDocument()
  expect(within(region).getByRole('list')).toHaveAttribute('aria-live', 'polite')
})

test('error toasts are announced immediately as alerts', async () => {
  const trigger = renderWithTrigger({ title: 'Could not save', tone: 'error' })

  await userEvent.click(trigger)

  expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
})

test('the dismiss button removes it', async () => {
  const trigger = renderWithTrigger({ title: 'Item saved', duration: Infinity })
  await userEvent.click(trigger)

  await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

  expect(screen.queryByText('Item saved')).not.toBeInTheDocument()
})

test('it hides itself after its duration', () => {
  vi.useFakeTimers()
  const trigger = renderWithTrigger({ title: 'Item saved', duration: 3000 })

  act(() => trigger.click())
  expect(screen.getByText('Item saved')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(2999))
  expect(screen.getByText('Item saved')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByText('Item saved')).not.toBeInTheDocument()
})

test('useToast outside the provider fails loudly', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => renderHook(() => useToast())).toThrow('useToast must be used inside <ToastProvider>')
})
