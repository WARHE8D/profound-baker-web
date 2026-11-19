import { Croissant } from 'lucide-react'
import { useState } from 'react'
import { apiUrl } from '@/api'
import { cn } from '@/lib/cn'

type ItemGalleryProps = {
  name: string
  imageUrls: string[]
  /** Same order as imageUrls; used for the strip. Falls back to the full image when missing. */
  thumbnailUrls: string[]
  dimmed?: boolean
}

/** The item's photos: one large image, and a strip of thumbnails to switch between them. */
export function ItemGallery({ name, imageUrls, thumbnailUrls, dimmed = false }: ItemGalleryProps) {
  const [selected, setSelected] = useState(0)
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())

  const index = Math.min(selected, Math.max(0, imageUrls.length - 1))
  const src = apiUrl(imageUrls[index])
  const count = imageUrls.length

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/3] overflow-hidden rounded-card border border-border bg-surface-muted">
        {src && !failed.has(src) ? (
          <img
            src={src}
            alt={count > 1 ? `${name}, photo ${index + 1} of ${count}` : name}
            decoding="async"
            onError={() => setFailed((prev) => new Set(prev).add(src))}
            className={cn('size-full object-cover', dimmed && 'opacity-60 grayscale')}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted">
            <Croissant aria-hidden="true" className="size-16" />
          </div>
        )}
      </div>

      {count > 1 && (
        <ul aria-label="Photos" className="flex flex-wrap gap-2">
          {imageUrls.map((full, i) => (
            <li key={full}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show photo ${i + 1} of ${count}`}
                aria-pressed={i === index}
                className={cn(
                  'block size-16 overflow-hidden rounded-control border-2 bg-surface-muted transition-colors sm:size-20',
                  i === index ? 'border-primary' : 'border-transparent hover:border-border',
                )}
              >
                <img
                  src={apiUrl(thumbnailUrls[i] ?? full)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
