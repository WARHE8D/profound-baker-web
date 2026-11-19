import { cn } from '@/lib/cn'

const variants = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'text-text hover:bg-surface-muted',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
} as const

const sizes = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

/** The Button look, for other elements that should look like one (e.g. ButtonLink). */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors',
    variants[variant],
    sizes[size],
    className,
  )
}
