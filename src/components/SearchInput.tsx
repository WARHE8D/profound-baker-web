import { Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from './controls'

type SearchInputProps = {
  /** The search in effect (usually from the URL). */
  value: string
  /** Called with the trimmed text once typing pauses. */
  onChange: (value: string) => void
  label: string
  placeholder?: string
  maxLength?: number
}

/**
 * Search as you type, sent once typing pauses (300 ms), or at once when the box loses focus: a
 * click on a result must not race a search still waiting to be sent.
 */
export function SearchInput({ value, onChange, label, placeholder, maxLength }: SearchInputProps) {
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  // The value changed from outside (back button, "Clear filters"): show that.
  if (value !== synced) {
    setSynced(value)
    setText(value)
  }

  // The search last sent, and the value it replaced. Until the value changes, the URL may not show
  // it yet (or ever, if the user has moved to another page meanwhile): sending it again would
  // cancel that navigation.
  const sent = useRef<{ text: string; from: string } | null>(null)
  const send = useCallback(
    (next: string) => {
      sent.current = { text: next, from: value }
      onChange(next)
    },
    [onChange, value],
  )
  const needsSending = useCallback(
    (next: string) =>
      next !== value && !(sent.current?.text === next && sent.current.from === value),
    [value],
  )

  // The search waiting for typing to pause. Leaving the box sends it at once, and cancels it: when
  // that blur came from a click on a result, nothing re-renders the box before it would fire, and a
  // second search then would cancel the move to the result's page.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const next = text.trim()
    if (!needsSending(next)) return
    timer.current = setTimeout(() => send(next), 300)
    return () => clearTimeout(timer.current)
  }, [text, needsSending, send])

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          clearTimeout(timer.current)
          const next = text.trim()
          if (needsSending(next)) send(next)
        }}
        className="pl-9"
      />
    </div>
  )
}
