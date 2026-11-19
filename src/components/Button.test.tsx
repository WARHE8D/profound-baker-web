import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'

test('is a non-submitting button by default and can be activated from the keyboard', async () => {
  const onClick = vi.fn<() => void>()
  render(<Button onClick={onClick}>Save</Button>)

  const button = screen.getByRole('button', { name: 'Save' })
  expect(button).toHaveAttribute('type', 'button')

  await userEvent.tab()
  expect(button).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('loading disables the button and marks it busy', async () => {
  const onClick = vi.fn<() => void>()
  render(
    <Button loading onClick={onClick}>
      Save
    </Button>,
  )

  const button = screen.getByRole('button', { name: 'Save' })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')

  await userEvent.click(button)
  expect(onClick).not.toHaveBeenCalled()
})

test('a className from the caller overrides the defaults', () => {
  render(<Button className="px-8">Wide</Button>)

  const button = screen.getByRole('button', { name: 'Wide' })
  expect(button).toHaveClass('px-8')
  expect(button).not.toHaveClass('px-4')
})
