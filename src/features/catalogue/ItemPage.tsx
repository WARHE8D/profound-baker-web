import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError, type Schema } from '@/api'
import { Badge, Button, EmptyState, ErrorState, useToast } from '@/components'
import { cartStore, MAX_QUANTITY_PER_ITEM, useCartLines } from '@/features/cart/cart-store'
import { QuantityInput } from '@/features/cart/QuantityInput'
import { formatMoney } from '@/lib/money'
import { isUuid } from '@/lib/uuid'
import { ItemGallery } from './ItemGallery'
import { formatLeadTime } from './lead-time'
import { catalogueItemQuery } from './queries'

/** `/items/:itemId`: one item's photos and details, with add to cart. */
export function ItemPage() {
  const { itemId } = useParams()
  const validId = isUuid(itemId) ? itemId : null
  // A malformed id would get a 400; it can't be an item, so it is "not found" without asking.
  const item = useQuery({ ...catalogueItemQuery(validId ?? ''), enabled: validId !== null })

  let content
  if (validId === null || (isApiError(item.error) && item.error.status === 404)) {
    content = <ItemNotFound />
  } else if (item.data) {
    content = <ItemDetails item={item.data} />
  } else if (item.isError) {
    content = (
      <ErrorState
        error={item.error}
        title="We couldn't load this item"
        onRetry={() => void item.refetch()}
        retrying={item.isFetching}
      />
    )
  } else {
    content = <ItemSkeleton />
  }

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{content}</div>
}

function ItemDetails({ item }: { item: Schema<'PublicItemResponse'> }) {
  const soldOut = !item.orderable

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
          <li>
            <Link to="/" className="underline-offset-4 hover:text-text hover:underline">
              Menu
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-4" />
          </li>
          <li>
            <Link
              to={{
                pathname: '/',
                search: `?${new URLSearchParams({ category: item.category.id })}`,
              }}
              className="underline-offset-4 hover:text-text hover:underline"
            >
              {item.category.name}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <ItemGallery
          name={item.name}
          imageUrls={item.imageUrls}
          thumbnailUrls={item.thumbnailUrls}
          dimmed={soldOut}
        />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold sm:text-4xl">{item.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold text-primary">{formatMoney(item.price)}</p>
              {soldOut && <Badge tone="warning">Sold out</Badge>}
            </div>
          </div>

          <p className="flex items-start gap-2 text-sm text-muted">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {formatLeadTime(item.leadTimeHours)}
              {item.leadTimeHours > 0 && '. You will see the earliest pickup time at checkout.'}
            </span>
          </p>

          {item.description && (
            <p className="text-base leading-relaxed whitespace-pre-line">{item.description}</p>
          )}

          {soldOut ? (
            <p className="rounded-control bg-surface-muted px-4 py-3 text-sm">
              This one is sold out for now. Please check back soon.
            </p>
          ) : (
            <AddToCart item={item} />
          )}
        </div>
      </div>
    </div>
  )
}

function AddToCart({ item }: { item: Schema<'PublicItemResponse'> }) {
  const { toast } = useToast()
  const [quantity, setQuantity] = useState(1)
  const inCart = useCartLines().find((line) => line.itemId === item.id)?.quantity ?? 0
  const room = MAX_QUANTITY_PER_ITEM - inCart

  function add() {
    const added = cartStore.add(item, quantity)
    setQuantity(1)
    if (added === quantity) {
      toast({ tone: 'success', title: `Added ${added} × ${item.name} to your cart` })
    } else {
      toast({
        tone: 'info',
        title:
          added > 0
            ? `Added ${added} × ${item.name} to your cart`
            : 'Your cart is full for this item',
        description: `You can order up to ${MAX_QUANTITY_PER_ITEM} of each item online. For more, please contact the bakery.`,
      })
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityInput
          label="Quantity"
          value={quantity}
          onChange={setQuantity}
          max={Math.max(1, room)}
          disabled={room <= 0}
        />
        <Button size="lg" onClick={add} disabled={room <= 0} className="flex-1 sm:flex-none">
          <ShoppingBag aria-hidden="true" className="size-5" />
          Add to cart
        </Button>
      </div>
      {inCart > 0 && (
        <p className="text-sm text-muted">
          {room > 0
            ? `${inCart} already in your cart.`
            : `${inCart} in your cart, the most you can order online.`}
        </p>
      )}
    </div>
  )
}

function ItemNotFound() {
  return (
    <EmptyState
      icon="🧁"
      title="We couldn't find that item"
      description="It may have sold out for the season or been taken off the menu."
      action={
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Back to the menu
        </Link>
      }
    />
  )
}

function ItemSkeleton() {
  return (
    <>
      <output className="sr-only">Loading the item…</output>
      <div aria-hidden="true" className="grid animate-pulse gap-8 md:grid-cols-2 md:gap-12">
        <div className="aspect-[4/3] rounded-card bg-surface-muted" />
        <div className="flex flex-col gap-4">
          <div className="h-9 w-3/4 rounded bg-surface-muted" />
          <div className="h-7 w-1/4 rounded bg-surface-muted" />
          <div className="h-4 w-1/2 rounded bg-surface-muted" />
          <div className="h-20 rounded bg-surface-muted" />
        </div>
      </div>
    </>
  )
}
