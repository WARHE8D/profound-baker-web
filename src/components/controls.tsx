import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { useFieldControlProps } from './field-context'

// Shared look for text-like controls. aria-invalid comes from <Field error> or the caller.
const controlClass = cn(
  'w-full rounded-control border border-border bg-surface px-3 text-sm text-text shadow-xs transition-colors',
  'placeholder:text-muted/70',
  'hover:border-muted/60',
  'focus-visible:border-ring',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
)

export function Input({ className, ...props }: ComponentProps<'input'>) {
  const fieldProps = useFieldControlProps(props)
  return <input className={cn(controlClass, 'h-10', className)} {...fieldProps} />
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  const fieldProps = useFieldControlProps(props)
  return (
    <textarea
      rows={rows}
      className={cn(controlClass, 'min-h-20 py-2', className)}
      {...fieldProps}
    />
  )
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  const fieldProps = useFieldControlProps(props)
  return (
    <select className={cn(controlClass, 'h-10 pr-8', className)} {...fieldProps}>
      {children}
    </select>
  )
}
