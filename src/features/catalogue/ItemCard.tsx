import { Clock, Croissant } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { apiUrl, type Schema } from '@/api'
import { Badge } from '@/components'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { formatLeadTime } from './lead-time'

type PublicItem = Schema<'PublicItemResponse'>

type ItemCardProps = {
  item: PublicItem
  /** Show the category name, for the "All" view where items of every category are mixed. */
  showCategory?: boolean
}

/** One item in the storefront grid: thumbnail, name, price and lead time. Links to its page. */
export function ItemCard({ item, showCategory = false }: ItemCardProps) {
  const soldOut = !item.orderable

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <ItemThumbnail src={apiUrl(item.thumbnailUrls[0])} dimmed={soldOut} />
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        {showCategory && (
          <p className="text-[0.6875rem] font-semibold tracking-wide text-muted uppercase sm:text-xs">
            {item.category.name}
          </p>
        )}
        <h3 className="text-base leading-snug font-semibold sm:text-lg">
          {/* The ::after overlay stretches the link over the whole card. */}
          <Link
            to={`/items/${item.id}`}
            className="outline-none after:absolute after:inset-0 hover:text-primary"
          >
            {item.name}
          </Link>
        </h3>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 sm:pt-2">
          <p className="text-base font-semibold text-primary">{formatMoney(item.price)}</p>
          {soldOut && <Badge tone="warning">Sold out</Badge>}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted sm:items-center sm:text-sm">
          <Clock aria-hidden="true" className="mt-px size-3.5 shrink-0 sm:mt-0 sm:size-4" />
          {formatLeadTime(item.leadTimeHours)}
        </p>
      </div>
    </article>
  )
}

/** The item's name sits right below, so the photo is decorative (empty alt). */
function ItemThumbnail({ src, dimmed }: { src: string | undefined; dimmed: boolean }) {
  // A missing or broken image falls back to a placeholder instead of the browser's broken icon.
  const [failedSrc, setFailedSrc] = useState<string>()
  const showImage = src !== undefined && failedSrc !== src

  return (
    <div className="aspect-[4/3] bg-surface-muted">
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className={cn('size-full object-cover', dimmed && 'opacity-60 grayscale')}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted">
          <Croissant aria-hidden="true" className="size-10" />
        </div>
      )}
    </div>
  )
}

/** Same footprint as an ItemCard, shown while the catalogue loads. */
export function ItemCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full animate-pulse flex-col overflow-hidden rounded-card border border-border bg-surface"
    >
      <div className="aspect-[4/3] bg-surface-muted" />
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="h-5 w-3/4 rounded bg-surface-muted" />
        <div className="h-5 w-1/4 rounded bg-surface-muted" />
        <div className="h-4 w-1/2 rounded bg-surface-muted" />
      </div>
    </div>
  )
}
