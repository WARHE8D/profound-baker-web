import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles'
import { Spinner } from './Spinner'

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks clicks while an action runs. */
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({
        variant,
        size,
        className: cn('disabled:cursor-not-allowed disabled:opacity-60', className),
      })}
      {...props}
    >
      {loading && <Spinner label={null} className="size-4" />}
      {children}
    </button>
  )
}
