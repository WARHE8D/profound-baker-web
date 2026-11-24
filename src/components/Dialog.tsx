import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { focusPageHeading } from './page-focus'

type DialogProps = {
  open: boolean
  /** Called on Esc, backdrop click or the close button. The parent sets open={false}. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** Buttons row at the bottom, e.g. Cancel / Confirm. */
  footer?: ReactNode
  className?: string
  children?: ReactNode
}

/**
 * Modal dialog on the native <dialog> element: the browser traps focus and closes it on Esc.
 * Closing (or removing it while open) gives focus back to the element that opened it, or, when
 * the action removed that element (a "Cancel order" button once the order is cancelled), to the
 * page's heading, rather than leaving it nowhere.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
      returnFocus(opener.current)
    }
  }, [open])

  // Removed while open (`{open && <Dialog …>}`): never closed, so nothing would move focus.
  useEffect(() => {
    const dialog = ref.current
    return () => {
      if (dialog?.open) returnFocus(opener.current)
    }
  }, [])

  return (
    // The backdrop click below is a mouse shortcut; Esc (onCancel) is its keyboard equivalent.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc fires "cancel": let the parent decide, so `open` stays the single source of truth.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-border bg-surface p-0 text-text shadow-card',
        'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-control p-1 text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>
        {children}
        {footer && <footer className="flex flex-wrap justify-end gap-2 pt-2">{footer}</footer>}
      </div>
    </dialog>
  )
}

function returnFocus(opener: Element | null) {
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
  else focusPageHeading()
}
