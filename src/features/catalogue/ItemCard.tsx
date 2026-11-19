import { Clock, Croissant } from 'lucide-react'
import { useState } from 'react'
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

/** One item in the storefront grid: thumbnail, name, price and lead time. */
export function ItemCard({ item, showCategory = false }: ItemCardProps) {
  const soldOut = !item.orderable

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface">
      <ItemThumbnail src={apiUrl(item.thumbnailUrls[0])} dimmed={soldOut} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        {showCategory && (
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {item.category.name}
          </p>
        )}
        <h3 className="text-lg leading-snug font-semibold">{item.name}</h3>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <p className="text-base font-semibold text-primary">{formatMoney(item.price)}</p>
          {soldOut && <Badge tone="warning">Sold out</Badge>}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Clock aria-hidden="true" className="size-4 shrink-0" />
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
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 w-3/4 rounded bg-surface-muted" />
        <div className="h-5 w-1/4 rounded bg-surface-muted" />
        <div className="h-4 w-1/2 rounded bg-surface-muted" />
      </div>
    </div>
  )
}
