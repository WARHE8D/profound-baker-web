import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App'

test('boots the real app on the storefront home page', async () => {
  render(<App />)

  expect(
    await screen.findByRole('heading', { level: 1, name: /fresh from the oven/i }),
  ).toBeInTheDocument()
})
