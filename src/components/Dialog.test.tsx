import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'
import { Dialog } from './Dialog'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => {
    onClose()
    setOpen(false)
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onClose={close} title="Reject order?" description="The customer sees it.">
        <p>Body</p>
      </Dialog>
    </>
  )
}

test('opens as a dialog named by its title and described by its description', async () => {
  render(<Harness />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open' }))

  const dialog = screen.getByRole('dialog', { name: 'Reject order?' })
  expect(dialog).toHaveAccessibleDescription('The customer sees it.')
  expect(dialog).toHaveAttribute('open')
})

test('the close button closes it', async () => {
  const onClose = vi.fn<() => void>()
  render(<Harness onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))

  await userEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Esc (the native "cancel" event) asks the parent to close', async () => {
  const onClose = vi.fn<() => void>()
  render(<Harness onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))

  const cancel = new Event('cancel', { cancelable: true })
  fireEvent(screen.getByRole('dialog'), cancel)

  expect(cancel.defaultPrevented).toBe(true)
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a click on the backdrop closes it, a click inside does not', async () => {
  const onClose = vi.fn<() => void>()
  render(<Harness onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))

  await userEvent.click(screen.getByText('Body'))
  expect(onClose).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('dialog'))
  expect(onClose).toHaveBeenCalledTimes(1)
})

function OnlyWhileOpen() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Mark paid…</Button>
      {open && <Dialog open onClose={() => setOpen(false)} title="Record payment" />}
    </>
  )
}

test('rendered only while open, it still gives focus back to the button that opened it', async () => {
  render(<OnlyWhileOpen />)
  const opener = screen.getByRole('button', { name: 'Mark paid…' })
  await userEvent.click(opener)
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

function CancelOnce() {
  const [open, setOpen] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  return (
    <main id="main">
      <h1>Order SC-1</h1>
      {!cancelled && <Button onClick={() => setOpen(true)}>Cancel order</Button>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this order?"
        footer={
          <Button
            onClick={() => {
              // As the real dialog does: the order updates and the dialog closes in one render.
              setCancelled(true)
              setOpen(false)
            }}
          >
            Yes, cancel
          </Button>
        }
      />
    </main>
  )
}

test('when its action removes the button that opened it, focus goes to the page heading', async () => {
  render(<CancelOnce />)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }))

  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
})
