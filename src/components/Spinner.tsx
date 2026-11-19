import { cn } from '@/lib/cn'

type SpinnerProps = {
  /** Read by screen readers. Pass null when the surrounding element already announces loading. */
  label?: string | null
  className?: string
}

export function Spinner({ label = 'Loading', className }: SpinnerProps) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('size-5 animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )

  if (label === null) return svg

  return (
    <output className="inline-flex">
      {svg}
      <span className="sr-only">{label}</span>
    </output>
  )
}
