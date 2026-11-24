import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (text.trim() === value) return
    const timer = setTimeout(() => onChange(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

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
        onBlur={() => text.trim() !== value && onChange(text.trim())}
        className="pl-9"
      />
    </div>
  )
}
