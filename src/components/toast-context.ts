import { createContext, useContext, type ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'error'

export type ToastOptions = {
  title: ReactNode
  description?: ReactNode
  tone?: ToastTone
  /** Milliseconds before it hides itself; Infinity keeps it until dismissed. Default 5s, errors 8s. */
  duration?: number
}

export type ToastApi = {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
