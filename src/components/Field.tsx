import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { FieldContext } from './field-context'

type FieldProps = {
  label: ReactNode
  /** Help text under the control. */
  hint?: ReactNode
  /** Validation message. Marks the control invalid and is announced to screen readers. */
  error?: ReactNode
  required?: boolean
  className?: string
  /** One control: Input, Textarea or Select. */
  children: ReactNode
}

/**
 * Label, control, hint and error, wired together for assistive technology:
 *   <Field label="Email" error={errors.email?.message}><Input type="email" /></Field>
 */
export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
        {children}
        {hint && (
          <p id={hintId} className="text-sm text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext>
  )
}
