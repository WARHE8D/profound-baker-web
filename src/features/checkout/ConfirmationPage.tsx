import { Bookmark, Check, CheckCircle2, Copy, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { Button, ButtonLink, EmptyState, useToast } from '@/components'
import { cartStore } from '@/features/cart/cart-store'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import type { CheckoutConfirmationState } from './CheckoutForm'

/** How long the Copy button says "Copied" before it goes back to "Copy link". */
export const COPIED_RESET_MS = 2500

/**
 * `/checkout/confirmation`: shown once, right after checkout, from the order handed over in the
 * navigation state. The server returns the magic-link token only in the checkout response, so this
 * page is the guest's one chance to save it.
 */
export function ConfirmationPage() {
  const state = useLocation().state as Partial<CheckoutConfirmationState> | null
  const order = state?.order
  const zone = state?.zone

  // The order is placed: the cart has done its job.
  useEffect(() => {
    if (order) cartStore.clear()
  }, [order])

  if (!order || !zone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          level={1}
          icon="🧁"
          title="Nothing to show here"
          description="This page only appears right after you place an order."
          action={<ButtonLink to="/">Back to the menu</ButtonLink>}
        />
      </div>
    )
  }

  const orderPath = `/orders/${order.accessToken}`

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-2">
        <CheckCircle2 aria-hidden="true" className="size-10 text-success" />
        <h1 className="text-3xl font-semibold sm:text-4xl">Thank you, your order is placed</h1>
        <p className="text-muted">
          The bakery will confirm it soon. Your reference is{' '}
          <strong className="font-semibold text-text">{order.reference}</strong>.
        </p>
      </div>

      <OrderLinkPanel path={orderPath} />

      <section aria-labelledby="order-summary" className="flex flex-col gap-3">
        <h2 id="order-summary" className="text-lg font-semibold">
          Order summary
        </h2>
        <dl className="grid gap-3 rounded-card border border-border bg-surface p-5 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-semibold">Pickup</dt>
          <dd>{formatLocal(order.pickupAt, zone, 'datetime')}</dd>
          <dt className="font-semibold">Items</dt>
          <dd>
            <ul className="flex flex-col gap-1">
              {order.lines.map((line) => (
                <li key={line.lineNo} className="flex justify-between gap-4">
                  <span>
                    {line.quantity} × {line.itemName}
                  </span>
                  <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt className="font-semibold">Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
        </dl>
      </section>

      <ButtonLink to="/" variant="secondary" className="self-start">
        Back to the menu
      </ButtonLink>
    </div>
  )
}

/** The magic link with Copy and bookmark actions, and the warning that it is shown only once. */
function OrderLinkPanel({ path }: { path: string }) {
  const { toast } = useToast()
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState(false)
  const url = new URL(path, window.location.origin).href

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      // Missing outside secure contexts (plain http other than localhost), so check first.
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Select the link so copying it by hand is one keystroke away.
      const link = linkRef.current
      const selection = window.getSelection()
      if (link && selection) {
        const range = document.createRange()
        range.selectNodeContents(link)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      toast({
        tone: 'error',
        title: "Couldn't copy the link",
        description: 'It is selected for you: press Ctrl+C (⌘C on a Mac) to copy it.',
      })
    }
  }

  return (
    <section
      aria-labelledby="order-link"
      className="flex flex-col gap-4 rounded-card border-2 border-primary/50 bg-primary/5 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="order-link" className="text-lg font-semibold">
          Save your order link
        </h2>
        <p className="text-sm text-muted">Use it to check on your order or cancel it.</p>
      </div>

      <a
        ref={linkRef}
        href={url}
        className="rounded-control border border-border bg-surface px-3 py-2 font-mono text-sm break-all text-primary underline"
      >
        {url}
      </a>

      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <ButtonLink to={path} target="_blank" rel="noopener" variant="secondary">
          <Bookmark aria-hidden="true" className="size-4" />
          Open to bookmark
        </ButtonLink>
      </div>
      {/* Announces the copy for screen readers; the button's label change alone may not be read. */}
      <output className="sr-only">{copied ? 'Order link copied' : ''}</output>
      <p className="text-xs text-muted">
        "Open to bookmark" opens your order in a new tab: bookmark it there with Ctrl+D (⌘D on a
        Mac), or add it to your home screen on a phone.
      </p>

      <div
        role="note"
        className="flex gap-3 rounded-control border border-warning/50 bg-warning/10 p-3 text-sm"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <p>
          <strong className="font-semibold">This link is shown only once.</strong> We can't show it
          again or send it to you later, so save it before you leave this page. Without it, you'll
          need to contact the bakery with your reference to change your order.
        </p>
      </div>
    </section>
  )
}
