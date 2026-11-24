import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SearchInput } from './SearchInput'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function Harness({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <SearchInput
      label="Search orders"
      value={value}
      onChange={(next) => {
        onSearch(next)
        setValue(next)
      }}
    />
  )
}

const box = () => screen.getByRole('searchbox', { name: 'Search orders' })

test('sends the trimmed search once typing pauses', () => {
  const onSearch = vi.fn<(value: string) => void>()
  render(<Harness onSearch={onSearch} />)

  fireEvent.change(box(), { target: { value: ' SC-1' } })
  act(() => vi.advanceTimersByTime(200))
  fireEvent.change(box(), { target: { value: ' SC-12 ' } })
  act(() => vi.advanceTimersByTime(299))
  expect(onSearch).not.toHaveBeenCalled()

  act(() => vi.advanceTimersByTime(1))
  expect(onSearch).toHaveBeenCalledExactlyOnceWith('SC-12')
})

test('sends a waiting search at once when the box loses focus, and only once', () => {
  const onSearch = vi.fn<(value: string) => void>()
  render(<Harness onSearch={onSearch} />)

  fireEvent.change(box(), { target: { value: 'SC-12' } })
  fireEvent.blur(box())
  expect(onSearch).toHaveBeenCalledExactlyOnceWith('SC-12')

  act(() => vi.advanceTimersByTime(1000))
  fireEvent.blur(box())
  expect(onSearch).toHaveBeenCalledOnce()
})
