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

test('a search the URL hasn’t shown yet is not sent twice', () => {
  const onChange = vi.fn<(value: string) => void>()
  // The parent never passes the new value back, as while the app moves to another page.
  const { rerender } = render(<SearchInput label="Search orders" value="" onChange={onChange} />)

  fireEvent.change(box(), { target: { value: 'SC-12' } })
  fireEvent.blur(box())
  expect(onChange).toHaveBeenCalledExactlyOnceWith('SC-12')

  // Re-rendered with a new callback (every render of a list page makes one): still once.
  rerender(<SearchInput label="Search orders" value="" onChange={(v) => onChange(v)} />)
  act(() => vi.advanceTimersByTime(1000))
  expect(onChange).toHaveBeenCalledOnce()
})

test('once focus has left the box, the search waiting for typing to pause is not sent again', () => {
  const onChange = vi.fn<(value: string) => void>()
  // Nothing re-renders the box: a click on a result has started the move to another page, which a
  // late second search would cancel.
  render(<SearchInput label="Search orders" value="" onChange={onChange} />)

  fireEvent.change(box(), { target: { value: 'SC-12' } })
  fireEvent.blur(box())
  act(() => vi.advanceTimersByTime(1000))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('SC-12')
})

test('the same search can be sent again once the value has moved on', () => {
  const onSearch = vi.fn<(value: string) => void>()
  render(<Harness onSearch={onSearch} />)

  fireEvent.change(box(), { target: { value: 'SC-12' } })
  act(() => vi.advanceTimersByTime(300))
  fireEvent.change(box(), { target: { value: '' } })
  act(() => vi.advanceTimersByTime(300))
  fireEvent.change(box(), { target: { value: 'SC-12' } })
  act(() => vi.advanceTimersByTime(300))

  expect(onSearch.mock.calls).toEqual([['SC-12'], [''], ['SC-12']])
})
