import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ToastContext, type ToastApi, type ToastOptions, type ToastTone } from './toast-context'

type ToastItem = Required<Pick<ToastOptions, 'tone' | 'duration'>> &
  Omit<ToastOptions, 'tone' | 'duration'> & { id: string }

const DEFAULT_DURATION: Record<ToastTone, number> = { info: 5000, success: 5000, error: 8000 }

const toneClass: Record<ToastTone, string> = {
  info: 'border-l-primary',
  success: 'border-l-success',
  error: 'border-l-danger',
}

/** Provides useToast() and renders the toasts in a screen-reader live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++nextId.current}`
    const tone = options.tone ?? 'info'
    const duration = options.duration ?? DEFAULT_DURATION[tone]
    setToasts((current) => [...current, { ...options, id, tone, duration }])
    return id
  }, [])

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext value={api}>
      {children}
      {/* Always rendered: a live region must exist before messages are added to it. */}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        <ol aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const { id, duration } = toast

  useEffect(() => {
    if (!Number.isFinite(duration)) return
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

  return (
    <li
      // Errors interrupt the screen reader; everything else waits its turn via aria-live="polite".
      role={toast.tone === 'error' ? 'alert' : undefined}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-control border border-l-4 border-border bg-surface p-4 text-text shadow-card',
        toneClass[toast.tone],
      )}
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && <p className="text-sm text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="-m-1 rounded-control p-1 text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </li>
  )
}
