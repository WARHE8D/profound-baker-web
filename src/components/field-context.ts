import { createContext, useContext } from 'react'

type FieldContextValue = {
  id: string
  describedBy: string | undefined
  invalid: boolean
  required: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * Accessibility props for a control rendered inside <Field>: links it to the label, hint and error.
 * Props the caller passes explicitly win.
 */
export function useFieldControlProps<
  P extends {
    id?: string
    required?: boolean
    'aria-describedby'?: string
    'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'
  },
>(props: P): P {
  const field = useContext(FieldContext)
  if (!field) return props
  return {
    ...props,
    id: props.id ?? field.id,
    required: props.required ?? field.required,
    'aria-describedby': props['aria-describedby'] ?? field.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  }
}
